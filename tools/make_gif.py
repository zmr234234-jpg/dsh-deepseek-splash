"""Assemble shots/seq/*.png into docs/preview.gif.

The frames come from tools/shoot_frames.ps1, which renders the standalone
preview page in headless Edge at fixed animation timestamps.
"""
import glob
import os
import re

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEQ = os.path.join(ROOT, "shots", "seq")
OUT = os.path.join(ROOT, "docs", "preview.gif")
WIDTH = 900
DURATION = 150  # ms per frame


def main():
    files = sorted(
        glob.glob(os.path.join(SEQ, "*.png")),
        key=lambda p: int(re.search(r"(\d+)", os.path.basename(p)).group(1)),
    )
    if not files:
        raise SystemExit("no frames in " + SEQ)

    frames = []
    for path in files:
        im = Image.open(path).convert("RGB")
        height = round(im.height * WIDTH / im.width)
        im = im.resize((WIDTH, height), Image.LANCZOS)
        frames.append(im.convert("P", palette=Image.ADAPTIVE, colors=256))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    frames[0].save(
        OUT,
        save_all=True,
        append_images=frames[1:],
        duration=DURATION,
        loop=0,
        optimize=True,
        disposal=2,
    )
    print("%s  %d frames  %d bytes" % (OUT, len(frames), os.path.getsize(OUT)))


if __name__ == "__main__":
    main()
