import pdfplumber

page = pdfplumber.open(
    r"C:\Users\PRATEEBHA\Downloads\3f2259aa-96c6-4e05-aed0-373013978385 (1).pdf"
).pages[0]

# group chars into words, then report the colour of the header/title/footer words
cs = sorted(page.chars, key=lambda c: (round(c["top"], 1), c["x0"]))
runs = []
for c in cs:
    top = round(c["top"], 1)
    if runs and runs[-1]["top"] == top and c["x0"] - runs[-1]["x1"] < 3:
        runs[-1]["x1"] = c["x0"] + (c["x1"] - c["x0"])
        runs[-1]["t"] += c["text"]
    else:
        runs.append(
            {"top": top, "x0": c["x0"], "x1": c["x1"], "t": c["text"],
             "size": c["size"], "color": c.get("non_stroking_color")}
        )

print("--- colour summary (rounded) ---")
seen = {}
for r in runs:
    col = tuple(round(v, 3) for v in (r["color"] or (0, 0, 0)))
    key = (col, round(r["size"], 1))
    seen.setdefault(key, []).append((r["top"], r["x0"], r["t"][:34]))

for key in sorted(seen, key=lambda k: (k[0], k[1])):
    col, size = key
    items = seen[key]
    print(f"\ncolor={col} size={size}  ({len(items)} runs)")
    for top, x0, t in items[:6]:
        print(f"    top={top:6.1f} x0={x0:6.1f}  {t!r}")
