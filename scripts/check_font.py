import base64
import re

src = open("src/lib/pdf/fontData.ts", encoding="utf-8").read()
from fontTools.ttLib import TTFont

for name in ["INTER_REGULAR_BASE64", "INTER_BOLD_BASE64"]:
    b64 = re.search(name + r' = "([^"]+)"', src).group(1)
    open(".fonttmp/check.ttf", "wb").write(base64.b64decode(b64))
    f = TTFont(".fonttmp/check.ttf")
    cmap = f.getBestCmap()
    print(name, "rupee:", 0x20B9 in cmap, "A:", 0x41 in cmap, "family:", f["name"].getDebugName(1))
