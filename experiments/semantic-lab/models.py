"""Pinned, local-only model inference for the CC98 semantic comparison lab.

Importing this module never imports ML libraries, downloads files, or reads posts.
Only download() accesses the network. predict()/load() require a complete local
snapshot and always pass trust_remote_code=False and use_safetensors=True.
"""

from __future__ import annotations

import argparse
from collections import OrderedDict
from dataclasses import dataclass
import gc
import hashlib
import json
import math
import os
from pathlib import Path
import threading
import time
from typing import Any


MANIFEST_PATH = Path(__file__).with_name("model-manifest.json")
MAX_TEXT_CHARACTERS = 10000
MAX_TOPIC_LABELS = 12
MAX_TOPIC_LABEL_CHARACTERS = 60
DEFAULT_HYPOTHESIS_TEMPLATE = "这段文字涉及{}。"


class ModelRuntimeError(RuntimeError):
    def __init__(self, code: str, message: str, details: Any = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


def _truthy(value: str | None) -> bool:
    return str(value or "").lower() in {"1", "true", "yes", "on"}


def default_cache_dir() -> Path:
    configured = os.environ.get("CC98_SEMANTIC_CACHE")
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path.home() / "Documents" / "GitHub" / "cc98-semantic-lab-runtime" / "models").resolve()


def read_manifest() -> dict[str, Any]:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def _plain_json(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False))


def _softmax(values: list[float]) -> list[float]:
    maximum = max(values)
    exps = [math.exp(value - maximum) for value in values]
    total = sum(exps)
    return [value / total for value in exps]


def _sigmoid(value: float) -> float:
    if value >= 0:
        return 1.0 / (1.0 + math.exp(-value))
    exp_value = math.exp(value)
    return exp_value / (1.0 + exp_value)


def validate_input(
    text: str,
    topic_labels: list[str] | None = None,
    hypothesis_template: str = DEFAULT_HYPOTHESIS_TEMPLATE,
    multi_label: bool = True,
) -> tuple[str, list[str] | None, str, bool]:
    if not isinstance(text, str) or not text.strip():
        raise ModelRuntimeError("INVALID_TEXT", "请输入非空文本。")
    if len(text) > MAX_TEXT_CHARACTERS:
        raise ModelRuntimeError("TEXT_TOO_LONG", f"一次最多输入 {MAX_TEXT_CHARACTERS} 个字符。")
    if not isinstance(multi_label, bool):
        raise ModelRuntimeError("INVALID_MULTI_LABEL", "multiLabel 必须为布尔值。")
    if not isinstance(hypothesis_template, str) or not 1 <= len(hypothesis_template) <= 200:
        raise ModelRuntimeError("INVALID_TEMPLATE", "假设模板需为 1 到 200 字符的文本，且只包含一个 {}。")
    if hypothesis_template.count("{}") != 1 or "{" in hypothesis_template.replace("{}", "") or "}" in hypothesis_template.replace("{}", ""):
        raise ModelRuntimeError("INVALID_TEMPLATE", "假设模板只允许一个 {} 占位符。")
    if topic_labels is not None:
        if not isinstance(topic_labels, list) or not 2 <= len(topic_labels) <= MAX_TOPIC_LABELS:
            raise ModelRuntimeError("INVALID_TOPIC_LABELS", f"请提供 2 到 {MAX_TOPIC_LABELS} 个候选标签。")
        cleaned = []
        for label in topic_labels:
            if not isinstance(label, str) or not label.strip() or len(label.strip()) > MAX_TOPIC_LABEL_CHARACTERS:
                raise ModelRuntimeError("INVALID_TOPIC_LABELS", f"每个候选标签需为 1 到 {MAX_TOPIC_LABEL_CHARACTERS} 个字符。")
            cleaned.append(label.strip())
        if len(set(cleaned)) != len(cleaned):
            raise ModelRuntimeError("INVALID_TOPIC_LABELS", "候选标签不能重复。")
        topic_labels = cleaned
    return text, topic_labels, hypothesis_template, multi_label


@dataclass
class _LoadedModel:
    tokenizer: Any
    model: Any
    torch: Any
    loaded_ms: int
    max_tokens: int


class ModelRuntime:
    def __init__(self, cache_dir: str | Path | None = None, offline: bool | None = None, max_loaded_models: int = 1):
        self.cache_dir = Path(cache_dir).expanduser().resolve() if cache_dir else default_cache_dir()
        self.offline = bool(offline) if offline is not None else (_truthy(os.environ.get("CC98_SEMANTIC_OFFLINE")) or _truthy(os.environ.get("HF_HUB_OFFLINE")))
        if isinstance(max_loaded_models, bool) or not isinstance(max_loaded_models, int) or not 1 <= max_loaded_models <= 3:
            raise ValueError("max_loaded_models must be between 1 and 3")
        self.max_loaded_models = max_loaded_models
        self._specs = {entry["id"]: entry for entry in read_manifest()["models"]}
        self._aliases = {spec["repository"].lower(): key for key, spec in self._specs.items()}
        self._loaded: OrderedDict[str, _LoadedModel] = OrderedDict()
        self._verified: set[str] = set()
        self._lock = threading.RLock()

    def _key(self, name: str) -> str:
        if not isinstance(name, str):
            raise ModelRuntimeError("UNKNOWN_MODEL", "请选择 cold、horizon 或 minilm 模型。")
        normalized = name.strip().lower()
        normalized = self._aliases.get(normalized, normalized)
        if normalized not in self._specs:
            raise ModelRuntimeError("UNKNOWN_MODEL", "请选择 cold、horizon 或 minilm 模型。")
        return normalized

    def _snapshot_path(self, key: str) -> Path:
        spec = self._specs[key]
        repo_folder = "models--" + spec["repository"].replace("/", "--")
        return self.cache_dir / repo_folder / "snapshots" / spec["revision"]

    def _is_downloaded(self, key: str) -> bool:
        snapshot = self._snapshot_path(key)
        return all((snapshot / item["path"]).is_file() and (snapshot / item["path"]).stat().st_size == item["bytes"] for item in self._specs[key]["downloadFiles"])

    def list_models(self) -> list[dict[str, Any]]:
        with self._lock:
            models = []
            for key, spec in self._specs.items():
                item = _plain_json(spec)
                item["downloadBytes"] = sum(file["bytes"] for file in spec["downloadFiles"])
                item["downloaded"] = self._is_downloaded(key)
                item["loaded"] = key in self._loaded
                models.append(item)
            return models

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {"backend": "transformers-pytorch-cpu", "device": "cpu", "dtype": "float32", "offline": self.offline, "cacheDir": str(self.cache_dir), "maxLoadedModels": self.max_loaded_models, "loadedModels": list(self._loaded)}

    def _verify_snapshot(self, key: str) -> Path:
        snapshot = self._snapshot_path(key)
        if not self._is_downloaded(key):
            raise ModelRuntimeError("MODEL_NOT_DOWNLOADED", "模型尚未完整下载；请先运行 setup.cmd 安装模型。", {"model": key, "revision": self._specs[key]["revision"]})
        if key not in self._verified:
            digest = hashlib.sha256()
            with (snapshot / "model.safetensors").open("rb") as handle:
                for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
                    digest.update(chunk)
            if digest.hexdigest() != self._specs[key]["weightSha256"]:
                raise ModelRuntimeError("MODEL_CHECKSUM_FAILED", "模型权重校验失败，请删除对应缓存后重新下载。", {"model": key})
            self._verified.add(key)
        return snapshot

    def download(self, model: str) -> dict[str, Any]:
        with self._lock:
            key = self._key(model)
            spec = self._specs[key]
            if self.offline and not self._is_downloaded(key):
                raise ModelRuntimeError("OFFLINE", "当前为离线模式，无法下载缺失的模型。")
            started = time.perf_counter()
            if not self._is_downloaded(key):
                try:
                    from huggingface_hub import snapshot_download
                except ImportError as error:
                    raise ModelRuntimeError("DEPENDENCIES_MISSING", "模型依赖尚未安装，请运行安装脚本。") from error
                self.cache_dir.mkdir(parents=True, exist_ok=True)
                try:
                    snapshot_download(repo_id=spec["repository"], revision=spec["revision"], cache_dir=str(self.cache_dir), allow_patterns=[file["path"] for file in spec["downloadFiles"]], local_files_only=self.offline, max_workers=2)
                except Exception as error:
                    raise ModelRuntimeError("DOWNLOAD_FAILED", "模型下载失败；请检查网络后重试，已下载的分块将保留。", {"model": key, "cause": type(error).__name__}) from error
            self._verify_snapshot(key)
            return {"model": key, "repository": spec["repository"], "revision": spec["revision"], "downloaded": True, "cachePath": str(self._snapshot_path(key)), "downloadBytes": sum(file["bytes"] for file in spec["downloadFiles"]), "elapsedMs": round((time.perf_counter() - started) * 1000)}

    def _import_libraries(self) -> tuple[Any, Any, Any]:
        try:
            import torch
            from transformers import AutoModelForSequenceClassification, AutoTokenizer
        except ImportError as error:
            raise ModelRuntimeError("DEPENDENCIES_MISSING", "模型依赖尚未安装，请运行安装脚本。") from error
        return torch, AutoTokenizer, AutoModelForSequenceClassification

    def load(self, model: str) -> dict[str, Any]:
        with self._lock:
            key = self._key(model)
            spec = self._specs[key]
            if key in self._loaded:
                self._loaded.move_to_end(key)
                return {"model": key, "revision": spec["revision"], "loaded": True, "loadedNow": False, "loadMs": 0, "maxInputTokens": self._loaded[key].max_tokens}
            snapshot = self._verify_snapshot(key)
            torch, auto_tokenizer, auto_model = self._import_libraries()
            while len(self._loaded) >= self.max_loaded_models:
                _, previous = self._loaded.popitem(last=False)
                del previous
                gc.collect()
            started = time.perf_counter()
            try:
                cpu_threads = max(1, min(8, int(os.environ.get("CC98_SEMANTIC_THREADS", "4"))))
                torch.set_num_threads(cpu_threads)
                tokenizer = auto_tokenizer.from_pretrained(str(snapshot), local_files_only=True, trust_remote_code=False, use_fast=True)
                classifier = auto_model.from_pretrained(str(snapshot), local_files_only=True, trust_remote_code=False, use_safetensors=True, dtype=torch.float32, attn_implementation="eager")
                classifier.to("cpu")
                classifier.eval()
                limits = [spec["maxInputTokens"]]
                tokenizer_max = getattr(tokenizer, "model_max_length", None)
                if isinstance(tokenizer_max, int) and 8 <= tokenizer_max < 100000:
                    limits.append(tokenizer_max)
                max_tokens = min(limits)
            except Exception as error:
                gc.collect()
                raise ModelRuntimeError("MODEL_LOAD_FAILED", "模型无法在本地 CPU 载入；请确认安装清单及模型缓存完整。", {"model": key, "cause": type(error).__name__}) from error
            elapsed = round((time.perf_counter() - started) * 1000)
            self._loaded[key] = _LoadedModel(tokenizer, classifier, torch, elapsed, max_tokens)
            return {"model": key, "revision": spec["revision"], "loaded": True, "loadedNow": True, "loadMs": elapsed, "maxInputTokens": max_tokens}

    def unload(self, model: str | None = None) -> dict[str, Any]:
        with self._lock:
            keys = [self._key(model)] if model is not None else list(self._loaded)
            released = []
            for key in keys:
                if key in self._loaded:
                    del self._loaded[key]
                    released.append(key)
            if released:
                gc.collect()
            return {"unloadedModels": released, "loadedModels": list(self._loaded)}

    def predict(self, model: str, text: str, topic_labels: list[str] | None = None, hypothesis_template: str = DEFAULT_HYPOTHESIS_TEMPLATE, multi_label: bool = True) -> dict[str, Any]:
        with self._lock:
            key = self._key(model)
            text, topic_labels, hypothesis_template, multi_label = validate_input(text, topic_labels, hypothesis_template, multi_label)
            spec = self._specs[key]
            if key != "minilm" and topic_labels is not None:
                raise ModelRuntimeError("UNSUPPORTED_TOPIC_LABELS", "自定义话题标签仅适用于 MiniLM 模型。")
            started = time.perf_counter()
            load_info = self.load(key)
            loaded = self._loaded[key]
            tokenizer, classifier, torch = loaded.tokenizer, loaded.model, loaded.torch
            inference_started = time.perf_counter()
            try:
                plain_ids = tokenizer(text, add_special_tokens=False, truncation=False, return_attention_mask=False)["input_ids"]
                if key == "minilm":
                    candidates = topic_labels or spec["defaultTopicLabels"]
                    hypotheses = [hypothesis_template.format(label) for label in candidates]
                    pair_special_tokens = tokenizer.num_special_tokens_to_add(pair=True)
                    hypothesis_lengths = [len(tokenizer(value, add_special_tokens=False, truncation=False, return_attention_mask=False)["input_ids"]) for value in hypotheses]
                    if any(length + pair_special_tokens + 8 > loaded.max_tokens for length in hypothesis_lengths):
                        raise ModelRuntimeError("HYPOTHESIS_TOO_LONG", "候选标签与模板过长，请缩短后重试。")
                    full_lengths = [len(plain_ids) + length + pair_special_tokens for length in hypothesis_lengths]
                    encoded = tokenizer([text] * len(candidates), hypotheses, padding=True, truncation="only_first", max_length=loaded.max_tokens, return_tensors="pt")
                else:
                    candidates = [entry["label"] for entry in spec["labels"]]
                    full_lengths = [len(plain_ids) + tokenizer.num_special_tokens_to_add(pair=False)]
                    encoded = tokenizer(text, truncation=True, max_length=loaded.max_tokens, return_tensors="pt")
                processed_tokens = max(int(value) for value in encoded["attention_mask"].sum(dim=1).tolist())
                with torch.inference_mode():
                    logits = classifier(**encoded).logits.detach().cpu().float().tolist()
                if any(not math.isfinite(float(value)) for row in logits for value in row):
                    raise ModelRuntimeError("INVALID_MODEL_OUTPUT", "模型返回了非有限分数。")
                if key == "cold":
                    if len(logits) != 1 or len(logits[0]) != 2:
                        raise ModelRuntimeError("INVALID_MODEL_OUTPUT", "COLD 输出维度与固定版本不符。")
                    scores = _softmax(logits[0])
                    score_type = "softmax"
                    toxicity = scores[1]
                elif key == "horizon":
                    if len(logits) != 1 or len(logits[0]) != 7:
                        raise ModelRuntimeError("INVALID_MODEL_OUTPUT", "Horizon 输出维度与固定版本不符。")
                    scores = [_sigmoid(float(value)) for value in logits[0]]
                    score_type = "independent-sigmoid"
                    toxicity = scores[0]
                else:
                    label_map = {str(name).lower(): int(index) for index, name in classifier.config.id2label.items()}
                    if "entailment" not in label_map or "contradiction" not in label_map or len(logits) != len(candidates):
                        raise ModelRuntimeError("INVALID_MODEL_OUTPUT", "MiniLM NLI 标签映射与固定版本不符。")
                    entailment, contradiction = label_map["entailment"], label_map["contradiction"]
                    if multi_label or len(candidates) == 1:
                        scores = [_softmax([row[contradiction], row[entailment]])[1] for row in logits]
                        score_type = "independent-nli-entailment"
                    else:
                        scores = _softmax([row[entailment] for row in logits])
                        score_type = "exclusive-nli-entailment"
                titles = {entry["label"]: entry["title"] for entry in spec["labels"]}
                labels = [{"label": label, "title": titles.get(label, label), "score": round(float(score), 7)} for label, score in zip(candidates, scores)]
                labels.sort(key=lambda item: item["score"], reverse=True)
                result = {"model": key, "repository": spec["repository"], "revision": spec["revision"], "task": spec["task"], "scoreType": score_type, "labels": labels, "elapsedMs": round((time.perf_counter() - started) * 1000), "inferenceMs": round((time.perf_counter() - inference_started) * 1000), "loadMs": load_info["loadMs"], "loadedNow": load_info["loadedNow"], "inputCharacters": len(text), "inputTokens": max(full_lengths), "processedTokens": processed_tokens, "maxInputTokens": loaded.max_tokens, "truncated": any(length > loaded.max_tokens for length in full_lengths), "device": "cpu", "dtype": "float32"}
                if key == "minilm":
                    result.update({"topicLabels": candidates, "hypothesisTemplate": hypothesis_template, "multiLabel": multi_label})
                else:
                    result["toxicityScore"] = round(float(toxicity), 7)
                return result
            except ModelRuntimeError:
                raise
            except Exception as error:
                raise ModelRuntimeError("INFERENCE_FAILED", "本地推理失败；请缩短文本或重新加载模型。", {"model": key, "cause": type(error).__name__}) from error


def main() -> int:
    parser = argparse.ArgumentParser(description="CC98 semantic lab model runner")
    parser.add_argument("command", choices=["list", "download", "load", "predict"])
    parser.add_argument("model", nargs="?", default="all")
    parser.add_argument("--cache-dir")
    parser.add_argument("--offline", action="store_true", default=None)
    parser.add_argument("--text")
    parser.add_argument("--topic-labels", help="JSON array of topic labels")
    arguments = parser.parse_args()
    runtime = ModelRuntime(cache_dir=arguments.cache_dir, offline=arguments.offline)
    try:
        if arguments.command == "list":
            result = {"runtime": runtime.status(), "models": runtime.list_models()}
        elif arguments.command == "predict":
            result = runtime.predict(arguments.model, arguments.text, topic_labels=json.loads(arguments.topic_labels) if arguments.topic_labels else None)
        else:
            names = [entry["id"] for entry in runtime.list_models()] if arguments.model == "all" else [arguments.model]
            operation = runtime.download if arguments.command == "download" else runtime.load
            result = [operation(name) for name in names]
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ModelRuntimeError, json.JSONDecodeError) as error:
        print(json.dumps({"error": {"code": getattr(error, "code", "INVALID_JSON"), "message": str(error), "details": getattr(error, "details", None)}}, ensure_ascii=False, indent=2))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
