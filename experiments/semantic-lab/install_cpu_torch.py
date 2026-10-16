"""Install the pinned Windows CPU wheel using system-proxy-aware curl.

Only the official PyTorch HTTPS host is accessed. This helper does not install
dependencies; requirements-models.txt installs them after this CPU wheel.
"""
from __future__ import annotations

import argparse
from html.parser import HTMLParser
import importlib.metadata
import json
from pathlib import Path, PurePosixPath
import re
import struct
import subprocess
import sys
from urllib.parse import parse_qs, unquote, urljoin, urlsplit, urlunsplit

from download_models import checked_cache_path, curl_environment, file_sha256, quarantine


TORCH_VERSION = "2.9.1+cpu"
INDEX_URL = "https://download.pytorch.org/whl/cpu/torch/"
ALLOWED_HOST = "download.pytorch.org"
HTTP_MARKER = "\n__CC98_HTTP_STATUS__:"


def platform_tag():
    if sys.platform != "win32" or struct.calcsize("P") != 8 or sys.version_info[:2] not in {(3, 10), (3, 11), (3, 12), (3, 13)}:
        raise RuntimeError("The CPU installer supports 64-bit Windows Python 3.10-3.13 only")
    return "cp" + str(sys.version_info.major) + str(sys.version_info.minor)


def official_url(url):
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.hostname != ALLOWED_HOST or parts.port not in (None, 443) or parts.username is not None or parts.password is not None:
        raise RuntimeError("Only official PyTorch HTTPS URLs are permitted")
    if not parts.path.startswith("/whl/cpu/"):
        raise RuntimeError("Only the official PyTorch CPU wheel directory is permitted")
    return url


class _Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []

    def handle_starttag(self, tag, attributes):
        if tag.lower() == "a":
            for name, value in attributes:
                if name.lower() == "href" and value:
                    self.links.append(value)


def select_wheel(index_html, tag):
    if not re.fullmatch(r"cp3(?:10|11|12|13)", tag):
        raise RuntimeError("Unsupported Python wheel tag")
    expected_name = "torch-" + TORCH_VERSION + "-" + tag + "-" + tag + "-win_amd64.whl"
    parser = _Links()
    parser.feed(index_html)
    matches = set()
    for href in parser.links:
        candidate = urljoin(INDEX_URL, href)
        parts = urlsplit(candidate)
        if unquote(PurePosixPath(parts.path).name) != expected_name:
            continue
        official_url(candidate)
        hashes = parse_qs(parts.fragment).get("sha256", [])
        if parts.query or len(hashes) != 1 or not re.fullmatch(r"[0-9a-fA-F]{64}", hashes[0]):
            raise RuntimeError("The official CPU wheel link has no valid SHA256")
        matches.add((urlunsplit((parts.scheme, parts.netloc, parts.path, "", "")), hashes[0].lower()))
    if len(matches) != 1:
        raise RuntimeError("Could not select exactly one official " + expected_name)
    url, digest = matches.pop()
    return {"filename": expected_name, "url": url, "sha256": digest}


def curl_get(curl, url, *, environment, output=None):
    official_url(url)
    # Do not follow redirects: an unexpected redirect must never cross hosts.
    command = [curl, "--fail", "--silent", "--show-error", "--retry", "3", "--retry-delay", "2", "--connect-timeout", "20", "--max-time", "1800", "--proto", "=https", "--write-out", HTTP_MARKER + "%{http_code}"]
    if output is not None:
        command.extend(["--output", str(output)])
    command.append(url)
    result = subprocess.run(command, check=False, capture_output=True, text=True, encoding="utf-8", errors="replace", env=environment)
    body, marker, status = (result.stdout or "").rpartition(HTTP_MARKER)
    if result.returncode or not marker or status.strip() != "200":
        raise RuntimeError("Official PyTorch download failed (curl " + str(result.returncode) + ", HTTP " + (status.strip() or "unknown") + ")")
    if output is None and len(body) > 5 * 1024 * 1024:
        raise RuntimeError("Official PyTorch wheel index is unexpectedly large")
    return body


def ensure_cpu_torch(runtime_dir, *, curl="curl.exe"):
    tag = platform_tag()
    try:
        installed = importlib.metadata.version("torch")
    except importlib.metadata.PackageNotFoundError:
        installed = None
    if installed == TORCH_VERSION:
        return {"version": TORCH_VERSION, "status": "already-installed"}
    runtime = Path(runtime_dir).expanduser().resolve()
    wheels = checked_cache_path(runtime / "wheels", runtime)
    wheels.mkdir(parents=True, exist_ok=True)
    environment = curl_environment()
    wheel = select_wheel(curl_get(curl, INDEX_URL, environment=environment), tag)
    target = checked_cache_path(wheels / wheel["filename"], runtime)
    partial = checked_cache_path(target.with_name(target.name + ".partial"), runtime)
    print("PyTorch CPU: verifying " + wheel["filename"], flush=True)
    if target.exists() and (not target.is_file() or file_sha256(target) != wheel["sha256"]):
        quarantine(target, runtime)
    if not target.is_file():
        if partial.exists():
            if partial.is_file() and file_sha256(partial) == wheel["sha256"]:
                partial.replace(target)
            else:
                quarantine(partial, runtime)
        if not target.is_file():
            print("PyTorch CPU: downloading official wheel", flush=True)
            curl_get(curl, wheel["url"], environment=environment, output=partial)
            if not partial.is_file() or file_sha256(partial) != wheel["sha256"]:
                if partial.exists():
                    quarantine(partial, runtime)
                raise RuntimeError("PyTorch CPU wheel checksum failed; invalid file quarantined")
            partial.replace(target)
    print("PyTorch CPU: installing verified local wheel", flush=True)
    subprocess.run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "--no-deps", str(target)], check=True)
    return {"version": TORCH_VERSION, "status": "installed", "wheelPath": str(target), "sha256": wheel["sha256"]}


def main():
    parser = argparse.ArgumentParser(description="Install the pinned Windows CPU PyTorch wheel")
    parser.add_argument("--runtime-dir", required=True)
    arguments = parser.parse_args()
    print(json.dumps(ensure_cpu_torch(arguments.runtime_dir), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
