"""Print the text lines of a generated invoice PDF (layout verification helper)."""

import sys

import pdfplumber

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

path = sys.argv[1]

with pdfplumber.open(path) as pdf:
    for pno, page in enumerate(pdf.pages, 1):
        print(f"=== page {pno}: {page.width:.0f} x {page.height:.0f}")
        words = page.extract_words()
        rows: dict[int, list] = {}
        for w in words:
            rows.setdefault(round(w["top"] / 3), []).append(w)
        for key in sorted(rows):
            group = sorted(rows[key], key=lambda x: x["x0"])
            print(f"  y={group[0]['top']:6.1f} | " + " ".join(w["text"] for w in group))
