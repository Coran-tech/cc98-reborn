import argparse
import json
import re
from pathlib import Path

from lxml import html as lxml_html


TAG_PATTERN = re.compile(r"\[\/?([a-z][a-z0-9-]*)(?:=[^\]\r\n]+)?\]", re.IGNORECASE)


def main():
    parser = argparse.ArgumentParser(description="Summarize syntax examples from an extracted CC98 tutorial page.")
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    document = lxml_html.fromstring(args.source.read_text(encoding="utf-8"))
    floors = []
    all_tags = set()
    for reply in document.xpath("//div[contains(concat(' ', normalize-space(@class), ' '), ' reply ')]"):
        substances = reply.xpath(".//div[contains(concat(' ', normalize-space(@class), ' '), ' substance ')]")
        if not substances:
            continue
        substance = substances[0]
        text = substance.text_content().replace("\r\n", "\n").replace("\r", "\n")
        text = "\n".join(line.rstrip() for line in text.splitlines()).strip()
        code_samples = []
        for node in substance.xpath(".//code"):
            sample = node.text_content().strip()
            if sample and sample not in code_samples:
                code_samples.append(sample)
        tags = sorted({match.group(1).lower() for match in TAG_PATTERN.finditer(text)})
        all_tags.update(tags)
        headings = [
            heading.text_content().strip()
            for heading in substance.xpath(".//h1 | .//h2 | .//h3 | .//h4")
            if heading.text_content().strip()
        ]
        floors.append({
            "floor": reply.get("id", ""),
            "headings": headings,
            "tags": tags,
            "codeSamples": code_samples,
            "text": text,
        })

    result = {
        "tags": sorted(all_tags),
        "floors": floors,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(floors)} floors and {len(all_tags)} tags to {args.output}")


if __name__ == "__main__":
    main()
