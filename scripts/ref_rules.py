"""List every drawn rule/box in the reference invoice so the layout can be mirrored."""

import sys

import pdfplumber

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

path = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\PRATEEBHA\Downloads\3f2259aa-96c6-4e05-aed0-373013978385 (1).pdf"

with pdfplumber.open(path) as pdf:
    page = pdf.pages[0]
    rows = []
    for c in page.curves:
        x0, x1, t, b = c["x0"], c["x1"], c["top"], c["bottom"]
        if abs(x1 - x0) < 0.6 and abs(b - t) < 0.6:
            kind = "?"
        elif abs(x1 - x0) < 0.6:
            kind = "V"
        elif abs(b - t) < 0.6:
            kind = "H"
        else:
            kind = "BOX"
        color = c.get("stroking_color")
        rows.append((round(t, 1), kind, x0, x1, t, b, c.get("linewidth"), color))
    for _, kind, x0, x1, t, b, lw, color in sorted(rows):
        print(f"{kind:3s} x0={x0:6.1f} x1={x1:6.1f} top={t:6.1f} bot={b:6.1f} lw={lw} color={color}")
