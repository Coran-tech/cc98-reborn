"""Contract checks without installing ML libraries or downloading weights."""

import contextlib
import importlib.util
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import models


class FakeTensor:
    def __init__(self, values):
        self.values = values

    def sum(self, dim):
        assert dim == 1
        return FakeTensor([sum(row) for row in self.values])

    def tolist(self):
        return self.values

    def detach(self):
        return self

    def cpu(self):
        return self

    def float(self):
        return self


class FakeTokenizer:
    model_max_length = 512

    def num_special_tokens_to_add(self, pair=False):
        return 4 if pair else 2

    def __call__(self, text, pair=None, **kwargs):
        if kwargs.get("add_special_tokens") is False:
            return {"input_ids": [1] * len(text)}
        texts = text if isinstance(text, list) else [text]
        pairs = pair if pair else [None] * len(texts)
        limit = kwargs.get("max_length", 512)
        lengths = [min(limit, len(value) + (len(hypothesis) + 4 if hypothesis is not None else 2)) for value, hypothesis in zip(texts, pairs)]
        longest = max(lengths)
        masks = [[1] * length + [0] * (longest - length) for length in lengths]
        return {"input_ids": FakeTensor(masks), "attention_mask": FakeTensor(masks)}


class FakeClassifier:
    def __init__(self, logits, id2label=None):
        self.logits = logits
        self.config = type("FakeConfig", (), {"id2label": id2label or {0: "entailment", 1: "neutral", 2: "contradiction"}})()

    def __call__(self, **encoded):
        return type("Output", (), {"logits": FakeTensor(self.logits)})()

    def to(self, device):
        self.device = device
        return self

    def eval(self):
        self.evaluating = True
        return self


class FakeTorch:
    float32 = "float32"
    threads = None

    @staticmethod
    def inference_mode():
        return contextlib.nullcontext()

    @classmethod
    def set_num_threads(cls, count):
        cls.threads = count


class ModelContracts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.runtime = models.ModelRuntime(cache_dir=self.temp.name, offline=True)

    def insert(self, key, logits, id2label=None):
        self.runtime._loaded[key] = models._LoadedModel(FakeTokenizer(), FakeClassifier(logits, id2label), FakeTorch, 0, self.runtime._specs[key]["maxInputTokens"])

    def test_manifest_has_fixed_revisions_and_safetensors_only(self):
        manifest = models.read_manifest()
        self.assertEqual(len(manifest["models"]), 3)
        for spec in manifest["models"]:
            with self.subTest(spec["id"]):
                self.assertRegex(spec["revision"], r"^[a-f0-9]{40}$")
                self.assertRegex(spec["weightSha256"], r"^[a-f0-9]{64}$")
                files = [item["path"] for item in spec["downloadFiles"]]
                self.assertIn("model.safetensors", files)
                self.assertFalse(any(name.endswith((".py", ".bin")) for name in files))
                self.assertGreater(spec["weightBytes"], 400000000)
        self.assertEqual(self.runtime._specs["cold"]["license"]["identifier"], "not-specified")
        self.assertEqual(self.runtime._specs["horizon"]["maxInputTokens"], 256)
        self.assertEqual(self.runtime._specs["minilm"]["nliLabelOrder"], ["entailment", "neutral", "contradiction"])

    def test_lists_and_status_do_not_import_ml_dependencies(self):
        before = {key for key in sys.modules if key in {"torch", "transformers", "huggingface_hub"}}
        entries = self.runtime.list_models()
        state = self.runtime.status()
        after = {key for key in sys.modules if key in {"torch", "transformers", "huggingface_hub"}}
        self.assertEqual(before, after)
        self.assertEqual(state["loadedModels"], [])
        self.assertEqual(state["device"], "cpu")
        self.assertTrue(state["offline"])
        self.assertTrue(all(not entry["downloaded"] and not entry["loaded"] for entry in entries))
        self.assertEqual(entries[0]["downloadBytes"], sum(item["bytes"] for item in entries[0]["downloadFiles"]))

    def test_input_validation_precedes_dependency_loading(self):
        bad_inputs = [None, "", "  ", 123, "x" * 10001]
        for value in bad_inputs:
            with self.subTest(type(value).__name__):
                with self.assertRaises(models.ModelRuntimeError) as result:
                    self.runtime.predict("cold", value)
                self.assertIn(result.exception.code, {"INVALID_TEXT", "TEXT_TOO_LONG"})

    def test_unknown_model(self):
        for value in [None, "arbitrary/repository", ""]:
            with self.assertRaises(models.ModelRuntimeError) as result:
                self.runtime.load(value)
            self.assertEqual(result.exception.code, "UNKNOWN_MODEL")

    def test_repository_alias(self):
        self.assertEqual(self.runtime._key("THU-COAI/ROBERTA-BASE-COLD"), "cold")
        self.assertEqual(self.runtime._key(" MiniLM "), "minilm")

    def test_missing_snapshot_never_downloads_during_predict(self):
        with patch.object(self.runtime, "download", side_effect=AssertionError("must not download")):
            with self.assertRaises(models.ModelRuntimeError) as result:
                self.runtime.predict("cold", "test")
        self.assertEqual(result.exception.code, "MODEL_NOT_DOWNLOADED")

    def test_offline_blocks_missing_download(self):
        with self.assertRaises(models.ModelRuntimeError) as result:
            self.runtime.download("horizon")
        self.assertEqual(result.exception.code, "OFFLINE")
        self.assertFalse(any(Path(self.temp.name).iterdir()))

    def test_cache_environment(self):
        with patch.dict("os.environ", {"CC98_SEMANTIC_CACHE": self.temp.name, "CC98_SEMANTIC_OFFLINE": "true"}):
            runtime = models.ModelRuntime()
            self.assertEqual(runtime.cache_dir, Path(self.temp.name).resolve())
            self.assertTrue(runtime.offline)

    def test_default_cache_does_not_use_virtualized_appdata(self):
        with patch.dict("os.environ", {"LOCALAPPDATA": str(Path(self.temp.name) / "virtualized-appdata")}, clear=True), patch("models.Path.home", return_value=Path(self.temp.name)):
            expected = Path(self.temp.name) / "Documents" / "GitHub" / "cc98-semantic-lab-runtime" / "models"
            self.assertEqual(models.default_cache_dir(), expected.resolve())

    def test_topic_labels_are_validated(self):
        for labels in [[], "topic", ["only-one"], [" ", "ok"], [None, "ok"], ["x" * 61, "ok"], ["same", " same "], [str(n) for n in range(13)]]:
            with self.subTest(labels=labels):
                with self.assertRaises(models.ModelRuntimeError) as result:
                    self.runtime.predict("minilm", "test", topic_labels=labels)
                self.assertEqual(result.exception.code, "INVALID_TOPIC_LABELS")
        for template in ["missing", "{} {}", "{topic}", "{} {x}", "x" * 201]:
            with self.assertRaises(models.ModelRuntimeError) as result:
                self.runtime.predict("minilm", "test", hypothesis_template=template)
            self.assertEqual(result.exception.code, "INVALID_TEMPLATE")

    def test_hypothesis_template_exact_200_character_boundary(self):
        template = "x" * 198 + "{}"
        _, _, validated, _ = models.validate_input("test", ["a", "b"], template)
        self.assertEqual(validated, template)
        with self.assertRaises(models.ModelRuntimeError) as result:
            models.validate_input("test", ["a", "b"], template + "x")
        self.assertEqual(result.exception.code, "INVALID_TEMPLATE")

    def test_topic_parameters_rejected_for_toxicity_models(self):
        with self.assertRaises(models.ModelRuntimeError) as result:
            self.runtime.predict("cold", "test", topic_labels=["topic", "other"])
        self.assertEqual(result.exception.code, "UNSUPPORTED_TOPIC_LABELS")

    def test_cold_uses_softmax_and_offensive_index_one(self):
        self.insert("cold", [[0.0, 2.0]])
        result = self.runtime.predict("cold", "test")
        scores = {item["label"]: item["score"] for item in result["labels"]}
        self.assertAlmostEqual(scores["offensive"], 0.8807971)
        self.assertAlmostEqual(sum(scores.values()), 1.0)
        self.assertEqual(result["toxicityScore"], scores["offensive"])
        self.assertEqual(result["scoreType"], "softmax")
        self.assertFalse(result["truncated"])
        self.assertEqual(result["processedTokens"], 6)
        self.assertFalse(result["loadedNow"])

    def test_horizon_uses_independent_sigmoid(self):
        self.insert("horizon", [[0.0, -1.0, 1.0, 2.0, -2.0, 3.0, -3.0]])
        result = self.runtime.predict("horizon", "test")
        scores = {item["label"]: item["score"] for item in result["labels"]}
        self.assertEqual(result["toxicityScore"], 0.5)
        self.assertAlmostEqual(scores["threat"], 0.8807971)
        self.assertAlmostEqual(scores["identity_attack"], 0.9525741)
        self.assertGreater(sum(scores.values()), 1.0)
        self.assertEqual(result["scoreType"], "independent-sigmoid")

    def test_minilm_entailment_index_is_read_from_config(self):
        self.insert("minilm", [[2.0, -9.0, 0.0], [0.0, 8.0, 2.0]])
        result = self.runtime.predict("minilm", "test", topic_labels=["topic-a", "topic-b"], hypothesis_template="This is {}.")
        scores = {item["label"]: item["score"] for item in result["labels"]}
        self.assertAlmostEqual(scores["topic-a"], 0.8807971)
        self.assertAlmostEqual(scores["topic-b"], 0.1192029)
        self.assertNotIn("toxicityScore", result)
        self.assertTrue(result["multiLabel"])
        self.assertEqual(result["hypothesisTemplate"], "This is {}.")

    def test_minilm_independent_scores_do_not_compete(self):
        self.insert("minilm", [[4.0, 0.0, 0.0], [4.0, 0.0, 0.0]])
        result = self.runtime.predict("minilm", "test", topic_labels=["a", "b"])
        self.assertGreater(sum(item["score"] for item in result["labels"]), 1.9)
        result = self.runtime.predict("minilm", "test", topic_labels=["a", "b"], multi_label=False)
        self.assertEqual([item["score"] for item in result["labels"]], [0.5, 0.5])
        self.assertEqual(result["scoreType"], "exclusive-nli-entailment")

    def test_truncation_is_explicit_and_respects_model_limit(self):
        self.insert("horizon", [[0.0] * 7])
        result = self.runtime.predict("horizon", "x" * 1000)
        self.assertTrue(result["truncated"])
        self.assertEqual(result["inputTokens"], 1002)
        self.assertEqual(result["processedTokens"], 256)
        self.assertEqual(result["maxInputTokens"], 256)

    def test_invalid_outputs_fail_visibly(self):
        for logits in [[[0.0]], [[float("nan"), 0.0]], [[float("inf"), 0.0]]]:
            self.insert("cold", logits)
            with self.assertRaises(models.ModelRuntimeError) as result:
                self.runtime.predict("cold", "test")
            self.assertEqual(result.exception.code, "INVALID_MODEL_OUTPUT")

    def test_unload_releases_models(self):
        self.insert("cold", [[0.0, 0.0]])
        self.assertEqual(self.runtime.unload("cold")["unloadedModels"], ["cold"])
        self.assertEqual(self.runtime.unload()["loadedModels"], [])

    def test_load_is_cpu_safetensors_only_and_evicts_previous_model(self):
        self.insert("cold", [[0.0, 0.0]])
        calls = []

        class AutoTokenizer:
            @staticmethod
            def from_pretrained(path, **kwargs):
                calls.append(("tokenizer", path, kwargs))
                return FakeTokenizer()

        class AutoModel:
            @staticmethod
            def from_pretrained(path, **kwargs):
                calls.append(("model", path, kwargs))
                return FakeClassifier([[0.0] * 7])

        with patch.object(self.runtime, "_verify_snapshot", return_value=Path(self.temp.name)), patch.object(self.runtime, "_import_libraries", return_value=(FakeTorch, AutoTokenizer, AutoModel)):
            result = self.runtime.load("horizon")
        self.assertTrue(result["loadedNow"])
        self.assertEqual(self.runtime.status()["loadedModels"], ["horizon"])
        self.assertEqual(self.runtime._loaded["horizon"].model.device, "cpu")
        self.assertTrue(self.runtime._loaded["horizon"].model.evaluating)
        for kind, path, options in calls:
            self.assertFalse(options["trust_remote_code"])
            self.assertTrue(options["local_files_only"])
            if kind == "model":
                self.assertTrue(options["use_safetensors"])
                self.assertEqual(options["dtype"], "float32")
                self.assertEqual(options["attn_implementation"], "eager")

    def test_stable_probability_math(self):
        self.assertEqual(models._softmax([10000.0, 10000.0]), [0.5, 0.5])
        self.assertEqual(models._sigmoid(10000.0), 1.0)
        self.assertEqual(models._sigmoid(-10000.0), 0.0)


if __name__ == "__main__":
    unittest.main()
