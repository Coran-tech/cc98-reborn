"""Exercise the local HTTP contract without downloading models or contacting the web."""

from __future__ import annotations

import http.client
import importlib.util
import json
from pathlib import Path
import sys
import threading
import time
import unittest


LAB_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB_ROOT))
SERVER_SPEC = importlib.util.spec_from_file_location("semantic_lab_http_server", LAB_ROOT / "server.py")
if SERVER_SPEC is None or SERVER_SPEC.loader is None:
    raise RuntimeError("Cannot import the semantic lab HTTP server")
SERVER_MODULE = importlib.util.module_from_spec(SERVER_SPEC)
sys.modules[SERVER_SPEC.name] = SERVER_MODULE
SERVER_SPEC.loader.exec_module(SERVER_MODULE)

TOKEN = "semantic-lab-test-token-not-a-real-secret"
EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop"
EXTENSION_ORIGIN = "chrome-extension://" + EXTENSION_ID
MODEL_IDS = ("cold", "horizon", "minilm")


class FakeRuntime:
    """The same public surface as the model runtime, with deterministic results."""

    def __init__(self):
        self.loaded = set()
        self.calls = []
        self.loads = []
        self.unloads = []
        self.lock = threading.Lock()

    def list_models(self):
        with self.lock:
            return [
                {
                    "id": model_id,
                    "name": model_id,
                    "task": "topic" if model_id == "minilm" else "toxicity",
                    "revision": "test-revision-" + model_id,
                    "downloaded": True,
                    "loaded": model_id in self.loaded,
                    "status": "ready" if model_id in self.loaded else "downloaded",
                    "error": None,
                }
                for model_id in MODEL_IDS
            ]

    def status(self):
        return {"loadedModels": sorted(self.loaded), "backend": "fake-only"}

    def load(self, model_id):
        if model_id not in MODEL_IDS:
            raise ValueError("Unknown model")
        with self.lock:
            self.loaded = {model_id}
            self.loads.append(model_id)
        return next(model for model in self.list_models() if model["id"] == model_id)

    def unload(self, model_id):
        if model_id not in MODEL_IDS:
            raise ValueError("Unknown model")
        with self.lock:
            self.loaded.discard(model_id)
            self.unloads.append(model_id)
        return next(model for model in self.list_models() if model["id"] == model_id)

    def predict(self, model_id, text, topic_labels=None, hypothesis_template=None, multi_label=True):
        if model_id not in MODEL_IDS:
            raise ValueError("Unknown model")
        with self.lock:
            self.calls.append((model_id, text, tuple(topic_labels or ()), hypothesis_template, multi_label))
        labels = (
            [{"label": label, "score": 0.9 if index == 0 else 0.1} for index, label in enumerate(topic_labels or ())]
            if model_id == "minilm"
            else [{"label": "toxic", "score": 0.9}, {"label": "normal", "score": 0.1}]
        )
        result = {
            "model": model_id,
            "revision": "test-revision-" + model_id,
            "task": "topic" if model_id == "minilm" else "toxicity",
            "labels": labels,
            "elapsedMs": 12.5,
            "truncated": False,
        }
        if model_id != "minilm":
            result["toxicityScore"] = 0.9
        return result


class ServerContractTests(unittest.TestCase):
    def setUp(self):
        self.runtime = FakeRuntime()
        self.server = SERVER_MODULE.create_server(
            self.runtime,
            host="127.0.0.1",
            port=0,
            token=TOKEN,
            allowed_extension_ids=(EXTENSION_ID,),
        )
        self.port = self.server.server_address[1]
        self.origin = "http://127.0.0.1:" + str(self.port)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.assertFalse(self.thread.is_alive(), "HTTP service did not shut down")

    def request(self, method, path, *, data=None, raw=None, headers=None, authorized=False):
        request_headers = dict(headers or {})
        if authorized:
            request_headers["Authorization"] = "Bearer " + TOKEN
        if data is not None:
            raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            connection.request(method, path, body=raw, headers=request_headers)
            response = connection.getresponse()
            body = response.read()
            response_headers = {key.lower(): value for key, value in response.getheaders()}
            try:
                parsed = json.loads(body)
            except (ValueError, UnicodeError):
                parsed = None
            return response.status, response_headers, body, parsed
        finally:
            connection.close()

    def evaluate(self, *, text="synthetic test discussion", models=None, topic_labels=None, headers=None):
        payload = {"text": text, "models": models if models is not None else ["cold"]}
        if topic_labels is not None:
            payload["topicLabels"] = topic_labels
        return self.request("POST", "/api/v1/evaluate", data=payload, headers=headers, authorized=True)

    def assert_rejected_input(self, payload):
        status, _, _, data = self.request("POST", "/api/v1/evaluate", data=payload, authorized=True)
        self.assertIn(status, (400, 422), data)
        self.assertEqual(self.runtime.calls, [], "Invalid input reached the model runtime")

    def test_health_is_public_and_reports_real_model_revisions(self):
        status, headers, _, data = self.request("GET", "/api/v1/health")
        self.assertEqual(status, 200, data)
        self.assertEqual({model["id"] for model in data["models"]}, set(MODEL_IDS))
        for model in data["models"]:
            self.assertEqual(model["revision"], "test-revision-" + model["id"])
        self.assertNotEqual(headers.get("access-control-allow-origin"), "*")
        self.assertEqual(self.runtime.calls, [])
        self.assertEqual(self.runtime.loads, [])

    def test_health_validates_correct_bearer_without_loading_or_inference(self):
        status, headers, body, data = self.request("GET", "/api/v1/health", authorized=True, headers={"Origin": EXTENSION_ORIGIN})
        self.assertEqual(status, 200, data)
        self.assertEqual(data["schemaVersion"], 1)
        self.assertEqual(headers.get("access-control-allow-origin"), EXTENSION_ORIGIN)
        self.assertNotIn(TOKEN.encode(), body)
        self.assertEqual(self.runtime.calls, [])
        self.assertEqual(self.runtime.loads, [])
        self.assertEqual(self.runtime.unloads, [])

    def test_health_rejects_wrong_bearer_without_loading_or_inference(self):
        for authorization in ("Bearer wrong-token", "Basic " + TOKEN, "", "Bearer " + TOKEN + "-wrong"):
            with self.subTest(authorization=authorization):
                status, _, body, data = self.request("GET", "/api/v1/health", headers={"Authorization": authorization})
                self.assertEqual(status, 401, data)
                self.assertEqual(data["schemaVersion"], 1)
                self.assertEqual(data["error"]["code"], "AUTH_REQUIRED")
                self.assertNotIn(TOKEN.encode(), body)
        self.assertEqual(self.runtime.calls, [])
        self.assertEqual(self.runtime.loads, [])
        self.assertEqual(self.runtime.unloads, [])

    def test_health_stays_responsive_while_model_runtime_is_locked(self):
        entered = threading.Event()
        release = threading.Event()
        original_predict = self.runtime.predict
        result_holder = []

        def blocking_predict(*args, **kwargs):
            result = original_predict(*args, **kwargs)
            with self.runtime.lock:
                entered.set()
                release.wait(timeout=4)
            return result

        self.runtime.predict = blocking_predict
        worker = threading.Thread(target=lambda: result_holder.append(self.evaluate()), daemon=True)
        worker.start()
        self.assertTrue(entered.wait(timeout=3), "Fake inference did not begin")
        try:
            started = time.monotonic()
            status, _, _, data = self.request("GET", "/api/v1/health")
            self.assertEqual(status, 200, data)
            self.assertLess(time.monotonic() - started, 1, "Health waited for the model lock")
            self.assertEqual(data["active"]["model"], "cold")
            self.assertEqual(data["active"]["status"], "evaluating")
        finally:
            release.set()
            worker.join(timeout=5)
        self.assertFalse(worker.is_alive())
        self.assertEqual(result_holder[0][0], 200, result_holder)

    def test_session_available_to_same_origin_and_local_script(self):
        for headers in ({}, {"Origin": self.origin}):
            with self.subTest(headers=headers):
                status, response_headers, _, data = self.request("GET", "/api/v1/session", headers=headers)
                self.assertEqual(status, 200, data)
                self.assertEqual(data["token"], TOKEN)
                self.assertIn("no-store", response_headers.get("cache-control", ""))

    def test_extension_cannot_obtain_session_token(self):
        status, headers, body, _ = self.request("GET", "/api/v1/session", headers={"Origin": EXTENSION_ORIGIN})
        self.assertIn(status, (401, 403))
        self.assertNotIn(TOKEN.encode(), body)
        self.assertNotEqual(headers.get("access-control-allow-origin"), "*")

    def test_cross_site_and_opaque_origins_are_rejected(self):
        origins = ("https://evil.example", "null", "http://127.0.0.1.evil.example", "http://127.0.0.1:1", "chrome-extension://" + "z" * 32)
        for origin in origins:
            with self.subTest(origin=origin):
                status, headers, body, _ = self.request("GET", "/api/v1/session", headers={"Origin": origin})
                self.assertIn(status, (400, 401, 403))
                self.assertNotIn(TOKEN.encode(), body)
                self.assertNotIn("access-control-allow-origin", headers)
                status, headers, _, _ = self.evaluate(headers={"Origin": origin})
                self.assertIn(status, (400, 401, 403))
                self.assertNotIn("access-control-allow-origin", headers)
        self.assertEqual(self.runtime.calls, [])

    def test_host_validation_prevents_dns_rebinding(self):
        hosts = ("evil.example:" + str(self.port), "localhost:" + str(self.port), "127.0.0.1:1", "127.0.0.1:" + str(self.port) + ".evil.example")
        for host in hosts:
            with self.subTest(host=host):
                status, _, body, _ = self.request("GET", "/api/v1/session", headers={"Host": host})
                self.assertIn(status, (400, 403))
                self.assertNotIn(TOKEN.encode(), body)

    def test_write_endpoints_require_the_bearer_token(self):
        for path, body in (("/api/v1/evaluate", {"text": "test", "models": ["cold"]}), ("/api/v1/models/cold/load", {}), ("/api/v1/models/cold/unload", {})):
            for authorization in (None, "Bearer wrong-token", "Basic " + TOKEN):
                with self.subTest(path=path, authorization=authorization):
                    headers = {"Authorization": authorization} if authorization else {}
                    status, _, _, _ = self.request("POST", path, data=body, headers=headers)
                    self.assertIn(status, (401, 403))
        self.assertEqual(self.runtime.calls, [])
        self.assertEqual(self.runtime.loads, [])
        self.assertEqual(self.runtime.unloads, [])

    def test_same_origin_authorized_evaluation(self):
        status, headers, _, data = self.evaluate(headers={"Origin": self.origin})
        self.assertEqual(status, 200, data)
        self.assertEqual(data["results"][0]["model"], "cold")
        self.assertNotEqual(headers.get("access-control-allow-origin"), "*")

    def test_allowed_extension_origin_has_exact_cors_response(self):
        status, headers, _, data = self.evaluate(headers={"Origin": EXTENSION_ORIGIN})
        self.assertEqual(status, 200, data)
        self.assertEqual(headers.get("access-control-allow-origin"), EXTENSION_ORIGIN)
        self.assertNotIn(TOKEN, json.dumps(data))

    def test_allowed_extension_preflight(self):
        status, headers, _, _ = self.request("OPTIONS", "/api/v1/evaluate", headers={
            "Origin": EXTENSION_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        })
        self.assertIn(status, (200, 204))
        self.assertEqual(headers.get("access-control-allow-origin"), EXTENSION_ORIGIN)
        self.assertIn("POST", headers.get("access-control-allow-methods", ""))
        for header in ("authorization", "content-type"):
            self.assertIn(header, headers.get("access-control-allow-headers", "").lower())

    def test_cross_site_preflight_rejected(self):
        status, headers, _, _ = self.request("OPTIONS", "/api/v1/evaluate", headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        })
        self.assertIn(status, (400, 403))
        self.assertNotIn("access-control-allow-origin", headers)

    def test_only_the_three_public_static_paths_are_served(self):
        for path in ("/", "/app.js", "/styles.css"):
            with self.subTest(path=path):
                status, headers, body, _ = self.request("GET", path)
                self.assertEqual(status, 200)
                self.assertGreater(len(body), 30)
                self.assertNotEqual(headers.get("access-control-allow-origin"), "*")
        for path in ("/server.py", "/model-manifest.json", "/../server.py", "/%2e%2e/server.py", "/.runtime/token", "/api/v1/missing"):
            with self.subTest(path=path):
                status, _, body, _ = self.request("GET", path)
                self.assertIn(status, (400, 403, 404))
                self.assertNotIn(TOKEN.encode(), body)

    def test_body_larger_than_64_kib_is_rejected(self):
        status, _, _, _ = self.request("POST", "/api/v1/evaluate", raw=b"x" * 65537, headers={"Content-Type": "application/json"}, authorized=True)
        self.assertEqual(status, 413)
        self.assertEqual(self.runtime.calls, [])

    def test_malformed_json_and_non_object_bodies_are_rejected(self):
        for raw in (b"{broken", b"[]", b"null", b'"string"'):
            with self.subTest(raw=raw):
                status, _, _, _ = self.request("POST", "/api/v1/evaluate", raw=raw, headers={"Content-Type": "application/json"}, authorized=True)
                self.assertIn(status, (400, 422))
        self.assertEqual(self.runtime.calls, [])

    def test_empty_and_non_string_text_are_rejected(self):
        for text in ("", " \n\t", None, 42, ["text"]):
            with self.subTest(text=text):
                self.assert_rejected_input({"text": text, "models": ["cold"]})

    def test_text_length_boundary_is_enforced(self):
        status, _, _, data = self.evaluate(text="a" * 10000)
        self.assertEqual(status, 200, data)
        self.assertEqual(len(self.runtime.calls[-1][1]), 10000)
        self.runtime.calls.clear()
        self.assert_rejected_input({"text": "a" * 10001, "models": ["cold"]})

    def test_unknown_and_invalid_model_lists_are_rejected(self):
        for models in (["not-a-real-model"], ["cold", "unknown"], [], "cold", 1):
            with self.subTest(models=models):
                self.assert_rejected_input({"text": "test", "models": models})

    def test_topic_labels_require_two_to_twelve_distinct_entries(self):
        bad_labels = (["one"], ["same", "same"], ["", "   "], [str(i) for i in range(13)], "one,two", ["a", 42])
        for labels in bad_labels:
            with self.subTest(labels=labels):
                self.assert_rejected_input({"text": "test", "models": ["minilm"], "topicLabels": labels})

    def test_topic_label_length_boundary(self):
        status, _, _, data = self.evaluate(models=["minilm"], topic_labels=["a" * 60, "normal"])
        self.assertEqual(status, 200, data)
        self.assertEqual(len(self.runtime.calls[-1][2][0]), 60)
        self.runtime.calls.clear()
        self.assert_rejected_input({"text": "test", "models": ["minilm"], "topicLabels": ["a" * 61, "normal"]})

    def test_batch_result_preserves_model_versions_and_scores(self):
        status, _, raw, data = self.evaluate(text="unique synthetic input, never echoed", models=list(MODEL_IDS), topic_labels=["attack", "discussion", "sport"])
        self.assertEqual(status, 200, data)
        self.assertTrue(data.get("requestId"))
        self.assertEqual({result["model"] for result in data["results"]}, set(MODEL_IDS))
        for result in data["results"]:
            self.assertEqual(result["revision"], "test-revision-" + result["model"])
            self.assertIsInstance(result["elapsedMs"], (int, float))
            self.assertIsInstance(result["truncated"], bool)
            self.assertGreater(len(result["labels"]), 0)
            for label in result["labels"]:
                self.assertIsInstance(label["label"], str)
                self.assertGreaterEqual(label["score"], 0)
                self.assertLessEqual(label["score"], 1)
            if result["model"] != "minilm":
                self.assertEqual(result["toxicityScore"], 0.9)
        self.assertNotIn(b"unique synthetic input, never echoed", raw)

    def test_identical_requests_reuse_cached_inference(self):
        first = self.evaluate(text="synthetic cached sample")
        second = self.evaluate(text="synthetic cached sample")
        self.assertEqual(first[0], 200, first[3])
        self.assertEqual(second[0], 200, second[3])
        self.assertEqual(len(self.runtime.calls), 1)
        self.assertEqual(first[3]["results"][0]["labels"], second[3]["results"][0]["labels"])

    def test_cache_distinguishes_model_and_topic_labels(self):
        for model_id, labels in (("cold", None), ("horizon", None), ("minilm", ["one", "two"]), ("minilm", ["one", "three"])):
            status, _, _, data = self.evaluate(text="same sample different tasks", models=[model_id], topic_labels=labels)
            self.assertEqual(status, 200, data)
        self.assertEqual(len(self.runtime.calls), 4)

    def test_authorized_load_and_unload_use_runtime(self):
        for action in ("load", "unload"):
            status, _, _, data = self.request("POST", "/api/v1/models/cold/" + action, data={}, authorized=True)
            self.assertEqual(status, 200, data)
        self.assertEqual(self.runtime.loads, ["cold"])
        self.assertEqual(self.runtime.unloads, ["cold"])

    def test_unknown_model_management_is_rejected(self):
        for action in ("load", "unload"):
            status, _, _, _ = self.request("POST", "/api/v1/models/unknown/" + action, data={}, authorized=True)
            self.assertIn(status, (400, 404, 422))
        self.assertEqual(self.runtime.loads, [])
        self.assertEqual(self.runtime.unloads, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
