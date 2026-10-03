import pdfplumber

page = pdfplumber.open(
    r"C:\Users\PRATEEBHA\Downloads\3f2259aa-96c6-4e05-aed0-373013978385 (1).pdf"
).pages[0]


def words(lo, hi):
    cs = [c for c in page.chars if lo <= c["top"] < hi]
    cs.sort(key=lambda c: (round(c["top"], 1), c["x0"]))
    out = []
    for c in cs:
        if out and out[-1]["top"] == round(c["top"], 1) and c["x0"] - out[-1]["x1"] < 2.5:
            out[-1]["x1"] = c["x1"]
            out[-1]["t"] += c["text"]
        else:
            out.append(
                {
                    "top": round(c["top"], 1),
                    "x0": c["x0"],
                    "x1": c["x1"],
                    "t": c["text"],
                    "size": c["size"],
                    "f": c["fontname"][-12:],
                }
            )
    for w in out:
        print(
            "%7.1f %7.1f %7.1f %4.1f %-14s %r"
            % (w["top"], w["x0"], w["x1"], w["size"], w["f"], w["t"])
        )


import sys

lo, hi = float(sys.argv[1]), float(sys.argv[2])
words(lo, hi)
