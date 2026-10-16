"""Run synthetic Chinese examples through the actual local HTTP/model stack."""
import argparse
import http.client
import json
from pathlib import Path
import time

SAMPLES = [
    ("normal", "正常讨论", "我觉得这项安排还有改进空间。工作日晚上有课的同学可能不方便参加，能否再提供一个周末时段？大家的需求不太一样，可以先收集一下意见。"),
    ("attack", "直接攻击", "你连这么简单的话都看不懂，还到处装懂，真是个蠢货。闭嘴吧，没人想听你胡说八道。"),
    ("quote", "引用并反对辱骂", "楼上说“你就是个蠢货，赶紧闭嘴”，我不赞同这样的表达。我们可以反对一个观点，但不应该对别人进行人身攻击。"),
    ("sarcasm", "反讽", "不愧是懂王，所有人都错了，就你一个人聪明。建议你先把题目读完再来指点江山。"),
    ("sport", "体育话题", "周六晚上有人一起看篮球比赛吗？这场两队的防守策略变化很有意思，想找几个人赛后聊聊，也欢迎支持另一队的朋友。"),
    ("sadness", "负面情绪", "今天考试没有考好，心里很难受，也有点担心接下来的安排。想先休息一下，明天再认真看看错在哪里。"),
]
LABELS = ["人身攻击", "正常讨论", "情感话题", "招聘推广", "体育讨论"]


def request(path, data=None, token=None):
    connection = http.client.HTTPConnection("127.0.0.1", 8766, timeout=180)
    try:
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        connection.request("GET" if data is None else "POST", path, body=json.dumps(data, ensure_ascii=False).encode("utf8") if data is not None else None, headers=headers)
        response = connection.getresponse()
        result = json.loads(response.read())
        if response.status != 200:
            raise RuntimeError("HTTP " + str(response.status) + ": " + str(result.get("error")))
        return result
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    token = request("/api/v1/session")["token"]
    report = {"syntheticSamplesOnly": True, "notAnAccuracyBenchmark": True, "createdAtUnix": time.time(), "topicLabels": LABELS, "results": []}
    failures = 0
    for model in ["cold", "horizon", "minilm"]:
        for sample_id, scenario, text in SAMPLES:
            result = request("/api/v1/evaluate", {"schemaVersion": 1, "models": [model], "text": text, "topicLabels": LABELS}, token)["results"][0]
            report["results"].append({"sampleId": sample_id, "scenario": scenario, "text": text, **result})
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
            if result.get("error"):
                failures += 1
                print(model + "/" + sample_id + ": " + str(result["error"]), flush=True)
            else:
                top = result["labels"][0]
                print(model + "/" + sample_id + ": " + top["label"] + "=" + str(round(top["score"], 3)) + ", " + str(result["elapsedMs"]) + "ms", flush=True)
    return bool(failures)


if __name__ == "__main__":
    raise SystemExit(main())
