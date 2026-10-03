"""Dump the reference invoice's layout (text lines with coordinates + boxes).

Used once to mirror the reference template's information architecture in our
print/PDF output. Reads a local PDF; never uploads anything.
"""

import sys

import pdfplumber

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

path = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\PRATEEBHA\Downloads\3f2259aa-96c6-4e05-aed0-373013978385 (1).pdf"

with pdfplumber.open(path) as pdf:
    for pno, page in enumerate(pdf.pages, 1):
        w, h = page.width, page.height
        print(f"=== page {pno}  size={w:.0f} x {h:.0f}  orientation={'landscape' if w > h else 'portrait'}")

        # ---- boxes / rules -------------------------------------------------
        rects = sorted(page.rects, key=lambda r: (round(r["top"]), r["x0"]))
        lines = sorted(page.lines, key=lambda l: (round(l["top"]), l["x0"]))
        print("\n-- rects --")
        for r in rects:
            print(
                f"  x0={r['x0']:7.1f} x1={r['x1']:7.1f} top={r['top']:7.1f} bot={r['bottom']:7.1f} "
                f"w={r['x1'] - r['x0']:6.1f} h={r['bottom'] - r['top']:6.1f} "
                f"fill={r.get('non_stroking_color')} stroke={r.get('stroking_color')}"
            )
        print("\n-- lines --")
        for l in lines[:40]:
            print(
                f"  x0={l['x0']:7.1f} x1={l['x1']:7.1f} top={l['top']:7.1f} bot={l['bottom']:7.1f} "
                f"w={l['x1'] - l['x0']:6.1f} stroke={l.get('stroking_color')}"
            )

        # ---- text lines ----------------------------------------------------
        words = page.extract_words(use_text_flow=False, keep_blank_chars=False, extra_attrs=["size", "fontname"])
        rows: dict[int, list] = {}
        for wd in words:
            key = round(wd["top"] / 3)  # cluster by vertical band
            rows.setdefault(key, []).append(wd)

        print("\n-- text lines (x0..x1, size) --")
        for key in sorted(rows):
            group = sorted(rows[key], key=lambda x: x["x0"])
            line = " ".join(w["text"] for w in group)
            sizes = sorted({round(w["size"], 1) for w in group})
            fonts = sorted({w["fontname"].split("+")[-1] for w in group})
            print(
                f"  x0={group[0]['x0']:6.1f} x1={group[-1]['x1']:6.1f} top={group[0]['top']:6.1f} "
                f"sz={sizes} fonts={fonts}\n      | {line}"
            )
