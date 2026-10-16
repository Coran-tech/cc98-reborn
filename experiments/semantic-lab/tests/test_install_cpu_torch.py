"""No-network, no-install checks for the official CPU-wheel bootstrap."""

from collections import namedtuple
from contextlib import redirect_stdout
import hashlib
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import install_cpu_torch


class TorchBootstrap(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix=".torch-test-", dir=ROOT / "tests")
        self.addCleanup(self.temp.cleanup)
        self.runtime = Path(self.temp.name).resolve()
        self.content = b"official-wheel-fixture"
        self.digest = hashlib.sha256(self.content).hexdigest()
        self.filename = "torch-2.9.1+cpu-cp311-cp311-win_amd64.whl"
        self.url = "https://download.pytorch.org/whl/cpu/torch-2.9.1%2Bcpu-cp311-cp311-win_amd64.whl"
        self.html = '<html><a href="' + self.url + '#sha256=' + self.digest + '">wheel</a></html>'
        self.wheel = self.runtime / "wheels" / self.filename
        self.output = io.StringIO()

    def fake_curl_get(self, curl, url, *, environment, output=None):
        self.assertEqual(environment, {"HTTPS_PROXY": "http://test-proxy:7890"})
        if output is None:
            self.assertEqual(url, install_cpu_torch.INDEX_URL)
            return self.html
        self.assertEqual(url, self.url)
        Path(output).write_bytes(self.content)
        return ""

    def ensure(self, *, installed="2.8.0", get=None):
        with patch("install_cpu_torch.platform_tag", return_value="cp311"), patch("install_cpu_torch.importlib.metadata.version", return_value=installed), patch("install_cpu_torch.curl_environment", return_value={"HTTPS_PROXY": "http://test-proxy:7890"}), patch("install_cpu_torch.curl_get", side_effect=get or self.fake_curl_get) as fetch, patch("install_cpu_torch.subprocess.run") as pip, redirect_stdout(self.output):
            self.last_pip = pip
            result = install_cpu_torch.ensure_cpu_torch(self.runtime)
        return result, fetch, pip

    def test_installed_cpu_version_skips_network_and_pip(self):
        result, fetch, pip = self.ensure(installed="2.9.1+cpu")
        self.assertEqual(result["status"], "already-installed")
        fetch.assert_not_called()
        pip.assert_not_called()
        self.assertFalse(self.wheel.parent.exists())

    def test_fresh_download_hashes_then_installs_local_wheel_without_dependencies(self):
        result, fetch, pip = self.ensure()
        self.assertEqual(result["status"], "installed")
        self.assertEqual(result["sha256"], self.digest)
        self.assertEqual(self.wheel.read_bytes(), self.content)
        self.assertEqual(fetch.call_count, 2)
        command = pip.call_args.args[0]
        self.assertEqual(command, [sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "--no-deps", str(self.wheel)])
        self.assertTrue(pip.call_args.kwargs["check"])

    def test_valid_cached_wheel_is_reused_after_index_verification(self):
        self.wheel.parent.mkdir()
        self.wheel.write_bytes(self.content)
        _, fetch, pip = self.ensure(installed="2.9.1")
        self.assertEqual(fetch.call_count, 1)
        pip.assert_called_once()
        self.assertEqual(self.wheel.read_bytes(), self.content)

    def test_invalid_cache_is_quarantined_and_replaced(self):
        self.wheel.parent.mkdir()
        self.wheel.write_bytes(b"x" * len(self.content))
        self.ensure()
        self.assertEqual(self.wheel.read_bytes(), self.content)
        self.assertEqual(len(list(self.wheel.parent.glob("*.bad-*"))), 1)

    def test_complete_valid_partial_is_reused(self):
        self.wheel.parent.mkdir()
        self.wheel.with_name(self.filename + ".partial").write_bytes(self.content)
        _, fetch, pip = self.ensure()
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(self.wheel.read_bytes(), self.content)
        pip.assert_called_once()

    def test_bad_download_is_quarantined_and_never_installed(self):
        def corrupt(curl, url, *, environment, output=None):
            if output is None:
                return self.html
            Path(output).write_bytes(b"bad-wheel")
            return ""

        with self.assertRaisesRegex(RuntimeError, "checksum failed"):
            self.ensure(get=corrupt)
        self.last_pip.assert_not_called()
        self.assertFalse(self.wheel.exists())
        self.assertEqual(len(list(self.wheel.parent.glob("*.bad-*"))), 1)

    def test_index_selects_only_exact_cpu_version_python_and_architecture(self):
        distractors = [self.html.replace("2.9.1%2Bcpu", "2.9.1%2Bcu128"), self.html.replace("cp311", "cp312"), self.html.replace("win_amd64", "linux_x86_64")]
        selected = install_cpu_torch.select_wheel("".join(distractors) + self.html, "cp311")
        self.assertEqual(selected, {"filename": self.filename, "url": self.url, "sha256": self.digest})
        with self.assertRaisesRegex(RuntimeError, "exactly one"):
            install_cpu_torch.select_wheel("".join(distractors), "cp311")

    def test_nonofficial_http_or_credential_links_are_rejected(self):
        for replacement in ["http://download.pytorch.org", "https://evil.example", "https://download.pytorch.org.evil.example", "https://user:pass@download.pytorch.org", "https://download.pytorch.org:444"]:
            with self.subTest(url=replacement), self.assertRaises(RuntimeError):
                install_cpu_torch.select_wheel(self.html.replace("https://download.pytorch.org", replacement), "cp311")

    def test_missing_hash_and_ambiguous_links_fail(self):
        with self.assertRaisesRegex(RuntimeError, "SHA256"):
            install_cpu_torch.select_wheel(self.html.replace(self.digest, "invalid-hash"), "cp311")
        with self.assertRaisesRegex(RuntimeError, "exactly one"):
            install_cpu_torch.select_wheel(self.html + self.html.replace(self.digest, "a" * 64), "cp311")

    def test_curl_does_not_follow_redirects_or_disable_tls(self):
        stdout = self.html + install_cpu_torch.HTTP_MARKER + "200"
        with patch("install_cpu_torch.subprocess.run", return_value=subprocess.CompletedProcess([], 0, stdout, "")) as run:
            result = install_cpu_torch.curl_get("curl.exe", install_cpu_torch.INDEX_URL, environment={})
        self.assertEqual(result, self.html)
        command = run.call_args.args[0]
        self.assertIn("--silent", command)
        self.assertIn("--show-error", command)
        self.assertNotIn("--location", command)
        self.assertNotIn("--insecure", command)
        self.assertEqual(command[command.index("--proto") + 1], "=https")
        with patch("install_cpu_torch.subprocess.run", return_value=subprocess.CompletedProcess([], 0, install_cpu_torch.HTTP_MARKER + "302", "")):
            with self.assertRaisesRegex(RuntimeError, "HTTP 302"):
                install_cpu_torch.curl_get("curl.exe", install_cpu_torch.INDEX_URL, environment={})

    def test_platform_restrictions_and_supported_tags(self):
        Version = namedtuple("Version", "major minor micro")
        for minor in (10, 11, 12, 13):
            with patch("install_cpu_torch.sys.platform", "win32"), patch("install_cpu_torch.sys.version_info", Version(3, minor, 0)), patch("install_cpu_torch.struct.calcsize", return_value=8):
                self.assertEqual(install_cpu_torch.platform_tag(), "cp3" + str(minor))
        for platform, bits, minor in [("linux", 8, 11), ("win32", 4, 11), ("win32", 8, 9), ("win32", 8, 14)]:
            with patch("install_cpu_torch.sys.platform", platform), patch("install_cpu_torch.sys.version_info", Version(3, minor, 0)), patch("install_cpu_torch.struct.calcsize", return_value=bits):
                with self.assertRaisesRegex(RuntimeError, "64-bit Windows"):
                    install_cpu_torch.platform_tag()


if __name__ == "__main__":
    unittest.main()
