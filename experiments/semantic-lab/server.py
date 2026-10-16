"""Loopback-only comparison UI/API. No post text is logged or persisted."""
from __future__ import annotations

import argparse
from collections import OrderedDict
from contextlib import contextmanager
import copy
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import threading
import time
import uuid

from models import ModelRuntime, ModelRuntimeError, DEFAULT_HYPOTHESIS_TEMPLATE

WEB = Path(__file__).with_name("web")
MODEL_IDS = {"cold", "horizon", "minilm"}
MAX_BODY = 65536


class ApiError(Exception):
    def __init__(self, code, message, status=400):
        self.code, self.message, self.status = code, message, status


def validate_request(data):
    if not isinstance(data, dict):
        raise ApiError("INVALID_INPUT", "请求须为 JSON 对象。")
    if data.get("schemaVersion", 1) != 1:
        raise ApiError("INVALID_VERSION", "不支持此接口版本。")
    text = data.get("text")
    if not isinstance(text, str) or not text.strip() or len(text) > 10000:
        raise ApiError("INVALID_TEXT", "请输入 1–10000 字符的非空文本。")
    models = data.get("models")
    if not isinstance(models, list) or not 1 <= len(models) <= 3 or any(not isinstance(item, str) or item not in MODEL_IDS for item in models) or len(set(models)) != len(models):
        raise ApiError("INVALID_MODELS", "models 须为不重复的 cold、horizon、minilm。")
    labels = data.get("topicLabels")
    if "minilm" in models:
        if not isinstance(labels, list) or not 2 <= len(labels) <= 12 or any(not isinstance(item, str) or not item.strip() or len(item.strip()) > 60 for item in labels):
            raise ApiError("INVALID_LABELS", "MiniLM 需要 2–12 个不同标签，每个最多 60 字符。")
        labels = [label.strip() for label in labels]
        if len(set(labels)) != len(labels):
            raise ApiError("INVALID_LABELS", "候选标签不能重复。")
    else:
        labels = None
    template = data.get("hypothesisTemplate", DEFAULT_HYPOTHESIS_TEMPLATE)
    if not isinstance(template, str) or not 1 <= len(template) <= 200 or template.count("{}") != 1 or "{" in template.replace("{}", "") or "}" in template.replace("{}", ""):
        raise ApiError("INVALID_TEMPLATE", "假设模板最多 200 字符，且须恰好含一个 {}。")
    multi = data.get("multiLabel", True)
    if not isinstance(multi, bool):
        raise ApiError("INVALID_INPUT", "multiLabel 须为布尔值。")
    return text, models, labels, template, multi


class LabState:
    def __init__(self, runtime):
        self.runtime = runtime
        self._lock = threading.Lock()
        self._work = threading.Lock()
        self._slots = threading.BoundedSemaphore(2)
        self._models = runtime.list_models()
        self._runtime_status = runtime.status()
        self.active = None
        self.cache = OrderedDict()

    def health(self):
        # Do not wait for the ML runtime lock: health stays responsive during load.
        if self._work.acquire(blocking=False):
            try:
                models, status = self.runtime.list_models(), self.runtime.status()
                with self._lock:
                    self._models, self._runtime_status = models, status
            finally:
                self._work.release()
        with self._lock:
            models = copy.deepcopy(self._models)
            active = copy.deepcopy(self.active)
            for item in models:
                item["status"] = active["status"] if active and active["model"] == item["id"] else "ready" if item.get("loaded") else "downloaded" if item.get("downloaded") else "unloaded"
            return {"schemaVersion": 1, "status": "ok", "models": models, "runtime": copy.deepcopy(self._runtime_status), "active": active, "textPersistence": False, "inferenceNetwork": False}

    @contextmanager
    def working(self):
        if not self._slots.acquire(blocking=False):
            raise ApiError("BUSY", "本地服务正在处理其他请求，请稍后再试。", 429)
        acquired = False
        try:
            acquired = self._work.acquire(timeout=2)
            if not acquired:
                raise ApiError("BUSY", "已有模型正在计算，请完成后再试。", 429)
            yield
        finally:
            if acquired:
                try:
                    models = self.runtime.list_models()
                    status = self.runtime.status()
                    with self._lock:
                        self._models, self._runtime_status, self.active = models, status, None
                finally:
                    self._work.release()
            self._slots.release()

    def set_active(self, model, status):
        with self._lock:
            self.active = {"model": model, "status": status}

    def evaluate(self, data):
        text, models, labels, template, multi = validate_request(data)
        results = []
        with self.working():
            revisions = {item["id"]: item["revision"] for item in self._models}
            tasks = {item["id"]: item.get("task", "unknown") for item in self._models}
            for model in models:
                payload = [1, model, revisions[model], text, labels if model == "minilm" else None, template if model == "minilm" else None, multi]
                key = hashlib.sha256(json.dumps(payload, ensure_ascii=False).encode("utf8")).hexdigest()
                now = time.monotonic()
                saved = self.cache.get(key)
                if saved and now - saved[0] <= 300:
                    result = copy.deepcopy(saved[1])
                    result.update({"cached": True, "originalElapsedMs": result["elapsedMs"], "elapsedMs": 0})
                    self.cache.move_to_end(key)
                else:
                    self.set_active(model, "evaluating")
                    started = time.perf_counter()
                    try:
                        result = self.runtime.predict(model, text, topic_labels=labels if model == "minilm" else None, hypothesis_template=template, multi_label=multi)
                        result["cached"] = False
                        self.cache[key] = (now, copy.deepcopy(result))
                        while len(self.cache) > 128:
                            self.cache.popitem(last=False)
                    except ModelRuntimeError as error:
                        result = {"model": model, "revision": revisions[model], "task": tasks[model], "labels": [], "elapsedMs": round((time.perf_counter() - started) * 1000), "truncated": False, "error": {"code": error.code, "message": error.message}}
                results.append(result)
        return {"schemaVersion": 1, "requestId": str(uuid.uuid4()), "results": results}


class LabServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def create_server(runtime, *, host="127.0.0.1", port=8766, token=None, allowed_extension_ids=()):
    if host != "127.0.0.1":
        raise ValueError("The lab may bind only to 127.0.0.1")
    if any(not re.fullmatch(r"[a-p]{32}", item) for item in allowed_extension_ids):
        raise ValueError("Invalid extension ID")
    server = LabServer((host, port), Handler)
    server.state = LabState(runtime)
    server.token = token or secrets.token_urlsafe(32)
    server.origin = f"http://127.0.0.1:{server.server_port}"
    server.extension_origins = {"chrome-extension://" + item for item in allowed_extension_ids}
    return server


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def log_message(self, *args):
        pass  # Neither request paths nor input text/token are written to logs.

    def send_data(self, status, data, content_type="application/json; charset=utf-8"):
        if not isinstance(data, bytes):
            data = json.dumps(data, ensure_ascii=False, allow_nan=False).encode("utf8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.send_header("Connection", "close")
        origin = self.headers.get("Origin")
        if origin in {self.server.origin} | self.server.extension_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            if self.command == "OPTIONS":
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
                if self.headers.get("Access-Control-Request-Private-Network") == "true":
                    self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()
        self.close_connection = True
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError, TimeoutError, OSError):
            pass

    def check_source(self):
        hosts = self.headers.get_all("Host", [])
        if hosts != [f"127.0.0.1:{self.server.server_port}"]:
            raise ApiError("INVALID_HOST", "仅支持固定回环地址。", 403)
        origin = self.headers.get("Origin")
        if origin is not None and origin not in {self.server.origin} | self.server.extension_origins:
            raise ApiError("INVALID_ORIGIN", "不允许此网页来源。", 403)
        if origin is None and self.headers.get("Sec-Fetch-Site") == "cross-site":
            raise ApiError("INVALID_ORIGIN", "不允许跨站请求。", 403)

    def require_token(self):
        supplied = self.headers.get("Authorization", "")
        if not hmac.compare_digest(supplied.encode("utf8"), ("Bearer " + self.server.token).encode("utf8")):
            raise ApiError("AUTH_REQUIRED", "需要本地服务授权令牌。", 401)

    def read_json(self):
        if self.headers.get("Transfer-Encoding"):
            raise ApiError("INVALID_BODY", "不支持分块请求正文。")
        if self.headers.get_content_type() != "application/json":
            raise ApiError("INVALID_CONTENT_TYPE", "请使用 application/json。", 415)
        try:
            length = int(self.headers.get("Content-Length", "-1"))
        except ValueError:
            length = -1
        if length < 0:
            raise ApiError("INVALID_BODY", "缺少合法正文长度。")
        if length > MAX_BODY:
            raise ApiError("BODY_TOO_LARGE", "请求正文超过 64 KiB。", 413)
        try:
            body = self.rfile.read(length)
            if len(body) != length:
                raise ValueError()
            return json.loads(body.decode("utf8"), parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
        except (ValueError, UnicodeDecodeError):
            raise ApiError("INVALID_JSON", "JSON 正文无效。")

    def handle_api(self):
        self.check_source()
        if self.command == "OPTIONS":
            if self.headers.get("Access-Control-Request-Method") not in {"GET", "POST"}:
                raise ApiError("INVALID_PREFLIGHT", "不支持此方法。", 403)
            self.send_data(204, b"")
            return
        if "?" in self.path or "#" in self.path:
            raise ApiError("INVALID_PATH", "接口不接受查询参数。", 404)
        if self.command == "GET":
            if self.path == "/api/v1/health":
                # The local UI may inspect public readiness without a token.
                # Extension CONNECT supplies Authorization and must verify it
                # before reporting a successful connection, without inference.
                if self.headers.get("Authorization") is not None:
                    self.require_token()
                self.send_data(200, self.server.state.health())
            elif self.path == "/api/v1/models":
                self.send_data(200, {"schemaVersion": 1, "models": self.server.state.health()["models"]})
            elif self.path == "/api/v1/session":
                if self.headers.get("Origin") in self.server.extension_origins:
                    raise ApiError("LOCAL_UI_ONLY", "请在本地试验台获取接入授权。", 403)
                self.send_data(200, {"schemaVersion": 1, "token": self.server.token})
            else:
                files = {"/": ("index.html", "text/html; charset=utf-8"), "/app.js": ("app.js", "text/javascript; charset=utf-8"), "/styles.css": ("styles.css", "text/css; charset=utf-8")}
                if self.path not in files:
                    raise ApiError("NOT_FOUND", "页面不存在。", 404)
                filename, mime = files[self.path]
                self.send_data(200, (WEB / filename).read_bytes(), mime)
            return
        data = self.read_json()
        self.require_token()
        if self.path == "/api/v1/evaluate":
            self.send_data(200, self.server.state.evaluate(data))
            return
        match = re.fullmatch(r"/api/v1/models/(cold|horizon|minilm)/(load|unload)", self.path)
        if match:
            with self.server.state.working():
                model, action = match.groups()
                self.server.state.set_active(model, "loading" if action == "load" else "unloading")
                result = getattr(self.server.state.runtime, action)(model)
            self.send_data(200, {"schemaVersion": 1, **result})
        elif self.path == "/api/v1/shutdown":
            self.send_data(200, {"schemaVersion": 1, "stopping": True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
        else:
            raise ApiError("NOT_FOUND", "接口不存在。", 404)

    def dispatch(self):
        try:
            self.handle_api()
        except ApiError as error:
            self.send_data(error.status, {"schemaVersion": 1, "error": {"code": error.code, "message": error.message}})
        except ModelRuntimeError as error:
            self.send_data(503, {"schemaVersion": 1, "error": {"code": error.code, "message": error.message}})
        except (ConnectionError, TimeoutError, OSError):
            self.close_connection = True
        except Exception:
            self.send_data(500, {"schemaVersion": 1, "error": {"code": "INTERNAL_ERROR", "message": "本地服务处理失败，请重新加载模型后再试。"}})

    do_GET = dispatch
    do_POST = dispatch
    do_OPTIONS = dispatch


def main():
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["DO_NOT_TRACK"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--cache-dir")
    parser.add_argument("--token-file", type=Path, required=True)
    parser.add_argument("--extension-id", action="append", default=[])
    args = parser.parse_args()
    args.token_file.parent.mkdir(parents=True, exist_ok=True)
    try:
        with args.token_file.open("x", encoding="utf8") as handle:
            handle.write(secrets.token_urlsafe(32))
    except FileExistsError:
        pass
    token = args.token_file.read_text(encoding="utf8").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", token):
        raise ValueError("Invalid local token file")
    runtime = ModelRuntime(cache_dir=args.cache_dir, offline=True, max_loaded_models=1)
    server = create_server(runtime, port=args.port, token=token, allowed_extension_ids=args.extension_id)
    print("CC98 Semantic Lab: " + server.origin, flush=True)
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()
        runtime.unload()


if __name__ == "__main__":
    main()
