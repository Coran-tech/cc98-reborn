"""Downloader recovery checks use temporary files and mocked curl only."""

from contextlib import nullcontext, redirect_stdout
import hashlib
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import download_models


class DownloadRecovery(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix=".download-test-", dir=ROOT / "tests")
        self.addCleanup(self.temp.cleanup)
        self.cache = Path(self.temp.name).resolve()
        self.snapshot = self.cache / "models--test--model" / "snapshots" / ("a" * 40)
        self.snapshot.mkdir(parents=True)
        self.good = b"known-safe-test-weights"
        self.spec = {"id": "test", "repository": "test/model", "revision": "a" * 40, "weightSha256": hashlib.sha256(self.good).hexdigest()}
        self.item = {"path": "model.safetensors", "bytes": len(self.good)}
        self.target = self.snapshot / self.item["path"]
        self.partial = self.target.with_name(self.target.name + ".partial")
        self.output = io.StringIO()

    def write_success(self, command, **kwargs):
        target = Path(command[command.index("--output") + 1])
        target.write_bytes(self.good)
        self.assertFalse(kwargs["check"])
        self.assertTrue(kwargs["capture_output"])
        self.assertIn("--silent", command)
        self.assertIn("--show-error", command)
        self.assertNotIn("--progress-bar", command)
        self.assertNotIn("--insecure", command)
        self.assertEqual(command[command.index("--proto") + 1], "=https")
        self.assertEqual(command[command.index("--proto-redir") + 1], "=https")
        self.assertEqual(command[-1], "https://huggingface.co/test/model/resolve/" + "a" * 40 + "/model.safetensors")
        return subprocess.CompletedProcess(command, 0, "200", "")

    def download(self, behavior=None):
        with patch("download_models.subprocess.run", side_effect=behavior or self.write_success) as run, redirect_stdout(self.output):
            result = download_models.download_file(self.spec, self.item, self.snapshot, self.cache, "curl.exe", environment={})
        return result, run

    def test_fresh_download_is_quiet_https_and_verified(self):
        target, run = self.download()
        self.assertEqual(target, self.target)
        self.assertEqual(target.read_bytes(), self.good)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(len(self.output.getvalue().splitlines()), 2)
        self.assertFalse(self.partial.exists())

    def test_valid_cached_weight_is_hashed_and_not_downloaded(self):
        self.target.write_bytes(self.good)
        target, run = self.download()
        self.assertEqual(target.read_bytes(), self.good)
        run.assert_not_called()

    def test_same_size_bad_cached_weight_is_quarantined_then_replaced(self):
        bad = b"x" * len(self.good)
        self.target.write_bytes(bad)
        _, run = self.download()
        self.assertEqual(run.call_count, 1)
        self.assertEqual(self.target.read_bytes(), self.good)
        bad_files = list(self.snapshot.glob("model.safetensors.bad-*"))
        self.assertEqual(len(bad_files), 1)
        self.assertEqual(bad_files[0].read_bytes(), bad)

    def test_complete_valid_partial_promotes_without_network(self):
        self.partial.write_bytes(self.good)
        _, run = self.download()
        run.assert_not_called()
        self.assertEqual(self.target.read_bytes(), self.good)
        self.assertFalse(self.partial.exists())

    def test_corrupt_and_overlong_partials_are_quarantined_before_download(self):
        for content in [b"x" * len(self.good), self.good + b"extra"]:
            with self.subTest(length=len(content)):
                if self.target.exists():
                    self.target.unlink()
                self.partial.write_bytes(content)
                _, run = self.download()
                self.assertNotIn("--continue-at", run.call_args.args[0])
                self.assertEqual(self.target.read_bytes(), self.good)
        self.assertEqual(len(list(self.snapshot.glob("model.safetensors.partial.bad-*"))), 2)

    def test_incomplete_partial_requests_resume(self):
        self.partial.write_bytes(self.good[:5])
        _, run = self.download()
        self.assertIn("--continue-at", run.call_args.args[0])
        self.assertEqual(self.target.read_bytes(), self.good)

    def test_resume_range_rejection_retries_from_zero_once(self):
        for curl_code, status in [(33, "206"), (22, "416")]:
            with self.subTest(code=curl_code):
                if self.target.exists():
                    self.target.unlink()
                self.partial.write_bytes(self.good[:5])
                calls = []

                def behavior(command, **kwargs):
                    calls.append(command)
                    if len(calls) == 1:
                        return subprocess.CompletedProcess(command, curl_code, status, "range rejected")
                    return self.write_success(command, **kwargs)

                _, run = self.download(behavior)
                self.assertEqual(run.call_count, 2)
                self.assertIn("--continue-at", calls[0])
                self.assertNotIn("--continue-at", calls[1])
                self.assertEqual(self.target.read_bytes(), self.good)
        self.assertEqual(len(list(self.snapshot.glob("model.safetensors.partial.bad-*"))), 2)

    def test_repeated_range_error_does_not_loop(self):
        self.partial.write_bytes(self.good[:5])
        with patch("download_models.subprocess.run", return_value=subprocess.CompletedProcess([], 22, "416", "")) as run, redirect_stdout(self.output):
            with self.assertRaisesRegex(RuntimeError, "Download failed"):
                download_models.download_file(self.spec, self.item, self.snapshot, self.cache, "curl.exe", environment={})
        self.assertEqual(run.call_count, 2)
        self.assertFalse(self.target.exists())

    def test_interruption_retains_short_partial_for_next_setup(self):
        def interrupted(command, **kwargs):
            self.partial.write_bytes(self.good[:5])
            return subprocess.CompletedProcess(command, 18, "200", "transfer interrupted")

        with self.assertRaisesRegex(RuntimeError, "curl 18"):
            self.download(interrupted)
        self.assertEqual(self.partial.read_bytes(), self.good[:5])
        self.assertFalse(self.target.exists())

    def test_corrupt_completed_download_is_quarantined(self):
        def corrupt(command, **kwargs):
            self.partial.write_bytes(b"x" * len(self.good))
            return subprocess.CompletedProcess(command, 0, "200", "")

        with self.assertRaisesRegex(RuntimeError, "Weight checksum failed"):
            self.download(corrupt)
        self.assertFalse(self.target.exists())
        self.assertFalse(self.partial.exists())
        self.assertEqual(len(list(self.snapshot.glob("model.safetensors.partial.bad-*"))), 1)
        self.download()
        self.assertEqual(self.target.read_bytes(), self.good)

    def test_success_response_with_oversized_body_is_quarantined(self):
        def corrupt(command, **kwargs):
            self.partial.write_bytes(self.good + b"extra")
            return subprocess.CompletedProcess(command, 0, "200", "")

        with self.assertRaisesRegex(RuntimeError, "Incomplete file"):
            self.download(corrupt)
        self.assertFalse(self.partial.exists())
        self.assertEqual(len(list(self.snapshot.glob("model.safetensors.partial.bad-*"))), 1)

    def test_path_escape_is_rejected_before_any_network_or_write(self):
        item = {"path": "../../../../escape.safetensors", "bytes": len(self.good)}
        with patch("download_models.subprocess.run") as run:
            with self.assertRaisesRegex(RuntimeError, "escaped model cache"):
                download_models.download_file(self.spec, item, self.snapshot, self.cache, "curl.exe", environment={})
        run.assert_not_called()
        self.assertFalse((self.cache.parent / "escape.safetensors").exists())

    def test_sha256_works_without_file_digest(self):
        self.target.write_bytes(self.good * 250000)
        self.assertEqual(download_models.file_sha256(self.target), hashlib.sha256(self.good * 250000).hexdigest())


class SystemProxy(unittest.TestCase):
    def registry(self, enabled=1, server="127.0.0.1:7890"):
        return types.SimpleNamespace(HKEY_CURRENT_USER=object(), OpenKey=lambda *args: nullcontext(object()), QueryValueEx=lambda key, name: ((enabled if name == "ProxyEnable" else server), 0))

    def test_enabled_windows_proxy_used_only_without_explicit_environment(self):
        with patch.dict("sys.modules", {"winreg": self.registry()}):
            self.assertEqual(download_models.system_proxy({}), "http://127.0.0.1:7890")
            for name in ("HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"):
                self.assertIsNone(download_models.system_proxy({name: "http://explicit-proxy:8080"}))

    def test_protocol_specific_proxy_and_disabled_registry(self):
        with patch.dict("sys.modules", {"winreg": self.registry(server="http=one:80;https=two:443")}):
            self.assertEqual(download_models.system_proxy({}), "http://two:443")
        with patch.dict("sys.modules", {"winreg": self.registry(enabled=0)}):
            self.assertIsNone(download_models.system_proxy({}))
        with patch.dict("sys.modules", {"winreg": self.registry(server="bad\nproxy")}):
            self.assertIsNone(download_models.system_proxy({}))

    def test_proxy_applies_only_to_curl_child_environment(self):
        with patch.dict("os.environ", {"PATH": "test-path"}, clear=True), patch("download_models.system_proxy", return_value="http://127.0.0.1:7890"):
            result = download_models.curl_environment()
            self.assertEqual(result["HTTPS_PROXY"], "http://127.0.0.1:7890")
            import os
            self.assertNotIn("HTTPS_PROXY", os.environ)


if __name__ == "__main__":
    unittest.main()
