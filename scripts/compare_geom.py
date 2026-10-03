"""Compare a generated invoice PDF's geometry against the reference invoice.

Usage: python compare_geom.py <generated.pdf> <reference.pdf>
"""

import sys

import pdfplumber

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

REF = r"C:\Users\PRATEEBHA\Downloads\3f2259aa-96c6-4e05-aed0-373013978385 (1).pdf"


def rules(path):
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[0]
        horiz, vert = [], []
        for e in page.edges:
            w = round(e.get("linewidth") or 0, 2)  # stored in pt (ref: 2.0 / 1.44 / 1.0)
            if abs(e["x1"] - e["x0"]) > 2 and abs(e["bottom"] - e["top"]) < 0.3:
                horiz.append((round(e["top"], 1), round(e["x0"], 1), round(e["x1"], 1), w))
            elif abs(e["bottom"] - e["top"]) > 2 and abs(e["x1"] - e["x0"]) < 0.3:
                vert.append((round(e["x0"], 1), round(e["top"], 1), round(e["bottom"], 1), w))
        return sorted(set(horiz)), sorted(set(vert))


def text(path, limit=200):
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[0]
        out = []
        for c in page.chars:
            out.append((round(c["top"], 1), round(c["x0"], 1), round(c["size"], 1), c["text"]))
        out.sort()
        lines, cur = [], []
        for item in out:
            if cur and item[0] - cur[0][0] < 2.0 and item[1] - cur[0][1] < 400:
                cur.append(item)
            else:
                if cur:
                    lines.append(cur)
                cur = [item]
        if cur:
            lines.append(cur)
        rows = []
        for ln in lines[:limit]:
            rows.append(
                (ln[0][0], ln[0][1], ln[0][2], "".join(i[3] for i in ln)[:52])
            )
        return rows


def main():
    ours = sys.argv[1]
    ref = sys.argv[2] if len(sys.argv) > 2 else REF

    for label, path in (("OURS", ours), ("REF", ref)):
        h, v = rules(path)
        print(f"----- {label} horizontal rules (top, x0, x1, lw_pt) -----")
        for r in h:
            print("   %6.1f %6.1f %6.1f  %s" % r)
        print(f"----- {label} vertical rules (x, top, bottom, lw_pt) -----")
        for r in v:
            print("   %6.1f %6.1f %6.1f  %s" % r)

    for label, path in (("OURS", ours), ("REF", ref)):
        print(f"----- {label} text (top, x0, size, text) -----")
        for r in text(path):
            print("   %6.1f %6.1f %5.1f  %r" % r)


if __name__ == "__main__":
    main()
