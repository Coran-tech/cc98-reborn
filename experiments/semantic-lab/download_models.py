"""Download pinned public files with OS curl, then verify before local inference.

This is an explicit setup step. The HTTP service never calls this downloader.
curl is used on Windows so the user's normal system TLS/proxy stack is retained.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
from urllib.parse import quote

from models import ModelRuntime, ModelRuntimeError, default_cache_dir, read_manifest


def file_sha256(path):
    """Use a bounded buffer rather than hashlib.file_digest (Python 3.11+)."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def checked_cache_path(path, cache):
    path, cache = Path(path).resolve(), Path(cache).resolve()
    if not path.is_relative_to(cache) or path == cache:
        raise RuntimeError("Download target escaped model cache")
    return path


def quarantine(path, cache):
    """Keep invalid files for inspection without replacing an unrelated path."""
    path = checked_cache_path(path, cache)
    if not path.exists():
        return None
    if not path.is_file():
        raise RuntimeError("Model cache path is not a regular file")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    destination = checked_cache_path(path.with_name(path.name + ".bad-" + stamp + "-" + secrets.token_hex(3)), cache)
    path.replace(destination)
    return destination


def system_proxy(environ=None):
    """Honor explicit proxy environment, otherwise read enabled Windows proxy.

    Registry reads do not change Windows configuration. No TLS settings change.
    The proxy is passed in the child environment, avoiding credentials in argv.
    """
    environ = os.environ if environ is None else environ
    if any(environ.get(key) for key in ("HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy")):
        return None
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Internet Settings") as key:
            enabled = winreg.QueryValueEx(key, "ProxyEnable")[0]
            value = winreg.QueryValueEx(key, "ProxyServer")[0]
    except (ImportError, OSError):
        return None
    if not enabled or not isinstance(value, str) or not value.strip():
        return None
    value = value.strip()
    if "=" in value:
        protocols = {}
        for entry in value.split(";"):
            if "=" in entry:
                protocol, endpoint = entry.split("=", 1)
                protocols[protocol.strip().lower()] = endpoint.strip()
        value = protocols.get("https") or protocols.get("http")
        if not value:
            return None
    if any(character in value for character in ("\r", "\n", "\x00")):
        return None
    return value if "://" in value else "http://" + value


def curl_environment():
    environment = dict(os.environ)
    proxy = system_proxy(environment)
    if proxy:
        environment["HTTPS_PROXY"] = proxy
    return environment


def download_file(spec, item, snapshot, cache, curl, *, environment=None):
    cache = Path(cache).resolve()
    target = checked_cache_path(Path(snapshot) / item["path"], cache)
    target.parent.mkdir(parents=True, exist_ok=True)
    expected_size = item["bytes"]
    weight_hash = spec["weightSha256"] if item["path"] == "model.safetensors" else None

    def complete(path):
        return path.is_file() and path.stat().st_size == expected_size and (weight_hash is None or file_sha256(path) == weight_hash)

    name = spec["id"] + ": " + item["path"]
    print(name + " (" + str(expected_size) + " bytes)", flush=True)
    if target.exists():
        if complete(target):
            print(name + ": verified (cached)", flush=True)
            return target
        quarantine(target, cache)
    partial = checked_cache_path(target.with_name(target.name + ".partial"), cache)
    if partial.exists():
        if not partial.is_file():
            raise RuntimeError("Partial model cache path is not a regular file")
        if partial.stat().st_size >= expected_size:
            if complete(partial):
                partial.replace(target)
                print(name + ": verified (completed partial)", flush=True)
                return target
            quarantine(partial, cache)
    url = "https://huggingface.co/" + spec["repository"] + "/resolve/" + spec["revision"] + "/" + quote(item["path"], safe="/")
    environment = curl_environment() if environment is None else environment
    for attempt in range(2):
        resume = partial.exists() and partial.stat().st_size > 0
        command = [curl, "--location", "--fail", "--silent", "--show-error", "--retry", "3", "--retry-delay", "2", "--connect-timeout", "20", "--max-time", "1800", "--proto", "=https", "--proto-redir", "=https", "--write-out", "%{http_code}", "--output", str(partial), url]
        if resume:
            command[1:1] = ["--continue-at", "-"]
        result = subprocess.run(command, check=False, capture_output=True, text=True, env=environment)
        http_status = (result.stdout or "").strip()[-3:]
        if result.returncode == 33 or http_status == "416":
            if attempt == 0 and resume:
                quarantine(partial, cache)
                continue
        if result.returncode:
            raise RuntimeError("Download failed: " + name + " (curl " + str(result.returncode) + ", HTTP " + (http_status or "unknown") + "); rerun setup.cmd to resume")
        break
    if not partial.is_file() or partial.stat().st_size != expected_size:
        if partial.is_file() and partial.stat().st_size > expected_size:
            quarantine(partial, cache)
        raise RuntimeError("Incomplete file: " + item["path"] + "; rerun setup.cmd to resume")
    if weight_hash is not None and file_sha256(partial) != weight_hash:
        quarantine(partial, cache)
        raise RuntimeError("Weight checksum failed: " + spec["id"] + "; invalid file quarantined, rerun setup.cmd")
    partial.replace(target)
    print(name + ": verified", flush=True)
    return target


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("models", nargs="*", choices=["cold", "horizon", "minilm", "all"], default=["all"])
    parser.add_argument("--cache-dir", default=str(default_cache_dir()))
    args = parser.parse_args()
    manifest = read_manifest()
    chosen = {item["id"] for item in manifest["models"]} if "all" in args.models else set(args.models)
    cache = Path(args.cache_dir).resolve()
    curl = shutil.which("curl.exe") or shutil.which("curl")
    if not curl:
        parser.error("curl is required for setup")
    results = []
    for spec in manifest["models"]:
        if spec["id"] not in chosen:
            continue
        snapshot = cache / ("models--" + spec["repository"].replace("/", "--")) / "snapshots" / spec["revision"]
        snapshot.mkdir(parents=True, exist_ok=True)
        for item in spec["downloadFiles"]:
            download_file(spec, item, snapshot, cache, curl)
        runtime = ModelRuntime(cache_dir=cache, offline=True)
        runtime._verify_snapshot(spec["id"])
        results.append({"model": spec["id"], "revision": spec["revision"], "verified": True})
        print(spec["id"] + ": verified", flush=True)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
