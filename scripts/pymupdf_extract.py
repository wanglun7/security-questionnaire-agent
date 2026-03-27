import json
import re
import sys
from pathlib import Path

import fitz


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def join_span_texts(spans: list[dict]) -> str:
    parts = [span.get("text", "").strip() for span in spans if span.get("text", "").strip()]
    text = " ".join(parts)
    return re.sub(r"\s+([,.;:!?])", r"\1", text).strip()


def join_line_texts(lines: list[str]) -> str:
    merged: list[str] = []
    for line in lines:
      if not line:
          continue
      if merged and merged[-1].endswith("-") and line[:1].islower():
          merged[-1] = f"{merged[-1][:-1]}{line}"
      else:
          merged.append(line)
    return normalize_text(" ".join(merged))


def is_bold_span(span: dict) -> bool:
    font = span.get("font", "") or ""
    flags = int(span.get("flags", 0) or 0)
    return "Bold" in font or bool(flags & 16)


def extract_layout(pdf_path: Path) -> dict:
    document = fitz.open(pdf_path)
    blocks: list[dict] = []
    regular_sizes: list[float] = []

    for page_index, page in enumerate(document, start=1):
        page_dict = page.get_text("dict", sort=True)
        text_block_index = 0

        for block in page_dict.get("blocks", []):
            if block.get("type") != 0:
                continue

            line_texts: list[str] = []
            spans_for_stats: list[dict] = []
            for line in block.get("lines", []):
                spans = [span for span in line.get("spans", []) if span.get("text", "").strip()]
                if not spans:
                    continue
                spans_for_stats.extend(spans)
                line_texts.append(join_span_texts(spans))

            text = join_line_texts(line_texts)
            if not text:
                continue

            sizes = [float(span.get("size", 0) or 0) for span in spans_for_stats]
            font_names = sorted({str(span.get("font", "")) for span in spans_for_stats if span.get("font")})
            bold_spans = sum(1 for span in spans_for_stats if is_bold_span(span))
            span_count = len(spans_for_stats)

            for span in spans_for_stats:
                if not is_bold_span(span):
                    regular_sizes.append(float(span.get("size", 0) or 0))

            blocks.append(
                {
                    "page": page_index,
                    "blockIndex": text_block_index,
                    "text": text,
                    "bbox": [round(value, 1) for value in block.get("bbox", [])],
                    "maxFontSize": round(max(sizes), 2) if sizes else 0,
                    "minFontSize": round(min(sizes), 2) if sizes else 0,
                    "fontNames": font_names,
                    "allBold": span_count > 0 and bold_spans == span_count,
                    "boldRatio": round(bold_spans / span_count, 3) if span_count else 0,
                }
            )
            text_block_index += 1

    median_regular_font_size = 0
    if regular_sizes:
        sorted_sizes = sorted(regular_sizes)
        median_regular_font_size = round(sorted_sizes[len(sorted_sizes) // 2], 2)

    preview_blocks = [block["text"] for block in blocks[:24]]
    return {
        "pageCount": document.page_count,
        "medianRegularFontSize": median_regular_font_size,
        "blocks": blocks,
        "previewText": "\n".join(preview_blocks),
    }


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: pymupdf_extract.py <pdf_path>", file=sys.stderr)
        return 1

    pdf_path = Path(sys.argv[1]).expanduser().resolve()
    result = extract_layout(pdf_path)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
