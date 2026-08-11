import argparse
from email import policy
from email.parser import BytesParser
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Extract the primary HTML document from an MHTML archive.")
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    message = BytesParser(policy=policy.default).parsebytes(args.source.read_bytes())
    html_part = next(
        (part for part in message.walk() if part.get_content_type() == "text/html"),
        None,
    )
    if html_part is None:
        raise SystemExit("No text/html part found in MHTML archive")

    payload = html_part.get_payload(decode=True)
    if payload is None:
        payload = str(html_part.get_payload()).encode("utf-8", errors="replace")

    try:
        html = payload.decode("utf-8")
    except UnicodeDecodeError:
        declared_charset = html_part.get_content_charset() or "utf-8"
        html = payload.decode(declared_charset, errors="replace")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(html, encoding="utf-8")
    print(f"extracted {len(html)} characters to {args.output}")


if __name__ == "__main__":
    main()
