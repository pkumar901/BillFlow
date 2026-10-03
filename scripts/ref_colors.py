import pdfplumber

page = pdfplumber.open(
    r"C:\Users\PRATEEBHA\Downloads\3f2259aa-96c6-4e05-aed0-373013978385 (1).pdf"
).pages[0]

WANTED = (
    "Customer Details:",
    "Invoice #",
    "Place of Supply",
    "Billing Address:",
    "Bank Details:",
    "Reference:",
    "Amount Payable:",
    "Total amount",
    "Taxable Amount",
    "Powered By",
    "Authorized Signatory",
    "This is a computer",
    "Mobile:",
)

cs = sorted(page.chars, key=lambda c: (round(c["top"], 1), c["x0"]))
runs = []
for c in cs:
    top = round(c["top"], 1)
    if runs and runs[-1]["top"] == top and c["x0"] - runs[-1]["x1"] < 3:
        runs[-1]["x1"] = c["x0"] + (c["x1"] - c["x0"])
        runs[-1]["t"] += c["text"]
        runs[-1]["color"] = c.get("non_stroking_color")
    else:
        runs.append(
            {
                "top": top,
                "x0": c["x0"],
                "x1": c["x1"],
                "t": c["text"],
                "size": c["size"],
                "color": c.get("non_stroking_color"),
            }
        )

for r in runs:
    if any(w in r["t"] for w in WANTED):
        print(
            "%7.1f %7.1f %4.1f %-18s %r"
            % (r["top"], r["x0"], r["size"], r["color"], r["t"])
        )
