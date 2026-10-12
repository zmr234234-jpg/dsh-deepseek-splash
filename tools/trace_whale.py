"""Trace the official DeepSeek whale mark (resources/icon.png) into an SVG path.

Pipeline:  luminance mask -> binarize -> marching squares (midpoint scheme)
           -> link segments into closed loops -> drop the 3 blowhole dots
           -> RDP simplify -> Chaikin smoothing -> SVG (evenodd) + <circle> dots.

Run:  python tools/trace_whale.py
Out:  assets/whale.svg  (+ a compact report on stdout)
"""
import os
import sys
import json
import numpy as np
from PIL import Image, ImageFilter

ICON = r"D:\deepseek\Data\DSH Desktop\resources\icon.png"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_SVG = os.path.join(ROOT, "assets", "whale.svg")

WHALE_WIDTH = 520      # working resolution of the traced mark
RDP_EPS = float(os.environ.get("DSS_RDP_EPS", "0.6"))     # simplification, source px
CHAIKIN_ITERS = int(os.environ.get("DSS_CHAIKIN", "1"))
BLUR_RADIUS = float(os.environ.get("DSS_BLUR", "0.6"))


def mask_from_icon():
    im = Image.open(ICON).convert("RGBA")
    w, h = im.size
    px = np.asarray(im, dtype=np.int32)
    lum = (px[:, :, 0] * 299 + px[:, :, 1] * 587 + px[:, :, 2] * 114) // 1000
    alpha = px[:, :, 3]
    m = np.where((alpha > 8) & (lum >= 165), 255, 0).astype(np.uint8)
    ys, xs = np.nonzero(m)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    crop = Image.fromarray(m[box[1]:box[3], box[0]:box[2]], mode="L")
    scale = WHALE_WIDTH / crop.width
    crop = crop.resize((WHALE_WIDTH, max(1, int(round(crop.height * scale)))), Image.LANCZOS)
    # a zero margin keeps every contour closed (otherwise border cells stay open)
    pad = 6
    canvas = Image.new("L", (crop.width + 2 * pad, crop.height + 2 * pad), 0)
    canvas.paste(crop, (pad, pad))
    if BLUR_RADIUS > 0:
        canvas = canvas.filter(ImageFilter.GaussianBlur(BLUR_RADIUS))
    return (np.asarray(canvas) > 140).astype(np.uint8)


def marching_squares(m):
    """Return closed loops (lists of (x, y) half-integer points)."""
    h, w = m.shape
    tl = m
    tr = np.zeros_like(m); tr[:, :-1] = m[:, 1:]
    bl = np.zeros_like(m); bl[:-1, :] = m[1:, :]
    br = np.zeros_like(m); br[:-1, :-1] = m[1:, 1:]
    idx = tl * 8 + tr * 4 + br * 2 + bl * 1
    segs = {}
    ys, xs = np.nonzero((idx > 0) & (idx < 15))
    for y, x in zip(ys.tolist(), xs.tolist()):
        c = int(idx[y, x])
        T = (2 * x + 1, 2 * y)
        R = (2 * x + 2, 2 * y + 1)
        B = (2 * x + 1, 2 * y + 2)
        L = (2 * x, 2 * y + 1)
        pairs = {
            1: [(L, B)], 2: [(B, R)], 3: [(L, R)], 4: [(T, R)],
            5: [(T, R), (B, L)], 6: [(T, B)], 7: [(L, T)], 8: [(L, T)],
            9: [(T, B)], 10: [(T, L), (B, R)], 11: [(T, R)], 12: [(L, R)],
            13: [(B, R)], 14: [(L, B)],
        }[c]
        for a, b in pairs:
            segs.setdefault(a, set()).add(b)
            segs.setdefault(b, set()).add(a)
    loops = []
    while segs:
        start = next(iter(segs))
        pts = [start]
        cur = start
        closed = False
        while True:
            nbrs = segs.get(cur)
            if not nbrs:
                break
            nxt = nbrs.pop()
            segs[nxt].discard(cur)
            if not nbrs:
                del segs[cur]
            if not segs.get(nxt):
                segs.pop(nxt, None)
            cur = nxt
            if cur == start:
                closed = True
                break
            pts.append(cur)
        if closed and len(pts) > 3:
            loops.append([(p[0] / 2.0, p[1] / 2.0) for p in pts])
    return loops


def signed_area(pts):
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return s / 2.0


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    keep = np.zeros(len(pts), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    arr = np.asarray(pts, dtype=float)
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        p, q = arr[i], arr[j]
        d = q - p
        n = np.hypot(*d)
        seg = arr[i + 1:j]
        if n == 0:
            dist = np.hypot(*(seg - p).T)
        else:
            dist = np.abs(np.cross(d, seg - p)) / n
        k = int(np.argmax(dist))
        if dist[k] > eps:
            m = i + 1 + k
            keep[m] = True
            stack.append((i, m))
            stack.append((m, j))
    return [pts[i] for i in range(len(pts)) if keep[i]]


def chaikin(pts, iters):
    for _ in range(iters):
        out = []
        n = len(pts)
        for i in range(n):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % n]
            out.append((0.75 * x1 + 0.25 * x2, 0.75 * y1 + 0.25 * y2))
            out.append((0.25 * x1 + 0.75 * x2, 0.25 * y1 + 0.75 * y2))
        pts = out
    return pts


def main():
    m = mask_from_icon()
    h, w = m.shape
    loops = marching_squares(m)
    big, dots = [], []
    for pts in loops:
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        bw, bh = max(xs) - min(xs), max(ys) - min(ys)
        area = abs(signed_area(pts))
        if bw < 42 and bh < 42 and abs(bw - bh) < 10 and area > 60:
            cx = sum(xs) / len(xs); cy = sum(ys) / len(ys)
            dots.append((round(cx, 2), round(cy, 2), round((bw + bh) / 4.0, 2), round(area, 1)))
        elif area > 20:
            big.append(pts)
    big.sort(key=lambda p: -abs(signed_area(p)))
    dots.sort(key=lambda d: d[0])

    parts, report = [], []
    for pts in big:
        pts = rdp(pts + [pts[0]], RDP_EPS)[:-1]
        pts = chaikin(pts, CHAIKIN_ITERS)
        d = "M" + " ".join(("%.2f %.2f" % p) for p in pts) + "Z"
        parts.append(d)
        report.append({"pts": len(pts), "area": round(abs(signed_area(pts)), 1)})

    circles = "".join(
        '<circle class="dss-dot" data-dot="%d" cx="%.2f" cy="%.2f" r="%.2f"/>' % (i, c[0], c[1], c[2])
        for i, c in enumerate(dots))
    path = '<path class="dss-whale-path" pathLength="1" fill-rule="evenodd" d="%s"/>' % " ".join(parts)
    svg = ('<svg class="dss-whale-svg" viewBox="0 0 %d %d" xmlns="http://www.w3.org/2000/svg" '
           'aria-hidden="true" focusable="false">%s%s</svg>') % (w, h, path, circles)

    os.makedirs(os.path.dirname(OUT_SVG), exist_ok=True)
    with open(OUT_SVG, "w", encoding="utf-8") as f:
        f.write(svg)
    print("work size      :", w, "x", h)
    print("big loops      :", json.dumps(report))
    print("dots           :", json.dumps(dots))
    print("svg bytes      :", len(svg))


if __name__ == "__main__":
    main()
