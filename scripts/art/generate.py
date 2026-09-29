#!/usr/bin/env python3
"""Deterministic riso-print illustrations for public/art/.

Each scene is drawn as separate ink layers (gold, teal, rust, ink) that are
misregistered, grained and multiplied like a two-drum risograph print, then
written as RGBA WebP so the art sits on any surface. Run:

    python3 scripts/art/generate.py            # every scene
    python3 scripts/art/generate.py home fees  # just these
"""

import math
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "art"
PREVIEW = Path("/tmp/anuhub-art")
SS = 2
PI = math.pi

INKS = {
    "gold": (226, 166, 28),
    "teal": (0, 134, 148),
    "rust": (198, 82, 38),
    "ink": (44, 38, 34),
}
PAPER = (248, 243, 230)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def axis_grad(x, y, ang, length, s0, s1, reverse=False):
    dx, dy = math.cos(ang), math.sin(ang)

    def g(X, Y):
        v = smooth(s0, s1, ((X - x) * dx + (Y - y) * dy) / length)
        return 1 - v if reverse else v

    return g


def side_grad(x, y, ang, width, s0=-0.1, s1=0.9, flip=False):
    px, py = -math.sin(ang), math.cos(ang)
    sign = -1 if flip else 1

    def g(X, Y):
        return smooth(s0, s1, sign * ((X - x) * px + (Y - y) * py) / (width * 0.5))

    return g


def radial_grad(cx, cy, r0, r1, reverse=False):
    def g(X, Y):
        v = smooth(r0, r1, np.hypot(X - cx, Y - cy))
        return 1 - v if reverse else v

    return g


def ellipse_poly(cx, cy, rx, ry, rot=0.0, n=56, a0=0.0, a1=2 * PI):
    c, s = math.cos(rot), math.sin(rot)
    pts = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        ex, ey = rx * math.cos(a), ry * math.sin(a)
        pts.append((cx + ex * c - ey * s, cy + ex * s + ey * c))
    return pts


def xform(pts, x, y, s, rot=0.0):
    c, sn = math.cos(rot), math.sin(rot)
    return [(x + (px * c - py * sn) * s, y + (px * sn + py * c) * s) for px, py in pts]


def bez(p, t):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = p
    u = 1 - t
    return (
        u**3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t**3 * x3,
        u**3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t**3 * y3,
    )


def bez_d(p, t):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = p
    u = 1 - t
    return (
        3 * u * u * (x1 - x0) + 6 * u * t * (x2 - x1) + 3 * t * t * (x3 - x2),
        3 * u * u * (y1 - y0) + 6 * u * t * (y2 - y1) + 3 * t * t * (y3 - y2),
    )


class Canvas:
    def __init__(self, w, h, seed):
        self.W, self.H = w, h
        self.w, self.h = w * SS, h * SS
        self.rng = random.Random(seed)
        self.nrng = np.random.default_rng(seed)
        self.layers = {k: np.zeros((self.h, self.w), np.float32) for k in INKS}

    def _raster(self, shape):
        kind = shape[0]
        if kind == "poly":
            pts, pad = shape[1], 2
        elif kind == "line":
            pts, pad = shape[1], shape[2] * SS / 2 + 3
        elif kind == "circle":
            cx, cy, r = shape[1:]
            pts, pad = [(cx - r, cy - r), (cx + r, cy + r)], 2
        else:
            raise ValueError(kind)
        spts = [(px * SS, py * SS) for px, py in pts]
        xs = [p[0] for p in spts]
        ys = [p[1] for p in spts]
        x0, y0 = max(int(min(xs) - pad), 0), max(int(min(ys) - pad), 0)
        x1, y1 = min(int(max(xs) + pad) + 1, self.w), min(int(max(ys) + pad) + 1, self.h)
        if x1 - x0 < 1 or y1 - y0 < 1:
            return None
        im = Image.new("L", (x1 - x0, y1 - y0), 0)
        d = ImageDraw.Draw(im)
        loc = [(px - x0, py - y0) for px, py in spts]
        if kind == "poly":
            d.polygon(loc, fill=255)
        elif kind == "line":
            width = max(1, int(round(shape[2] * SS)))
            d.line(loc, fill=255, width=width, joint="curve")
            r = width / 2
            for px, py in (loc[0], loc[-1]):
                d.ellipse((px - r, py - r, px + r, py + r), fill=255)
        else:
            d.ellipse(loc, fill=255)
        return x0, y0, x1, y1, np.asarray(im, np.float32) / 255

    def _grid(self, x0, y0, x1, y1):
        return np.meshgrid((np.arange(x0, x1) + 0.5) / SS, (np.arange(y0, y1) + 0.5) / SS)

    def fill(self, ink, shape, density=1.0, grad=None, occlude=False):
        r = self._raster(shape)
        if r is None:
            return
        x0, y0, x1, y1, m = r
        if occlude:
            for layer in self.layers.values():
                layer[y0:y1, x0:x1] *= 1 - m
        m = m * density
        if grad is not None:
            m = m * grad(*self._grid(x0, y0, x1, y1))
        view = self.layers[ink][y0:y1, x0:x1]
        np.maximum(view, m, out=view)

    def erase(self, shape, amount=1.0, inks=None):
        r = self._raster(shape)
        if r is None:
            return
        x0, y0, x1, y1, m = r
        for k in inks or INKS:
            self.layers[k][y0:y1, x0:x1] *= 1 - m * amount

    def _lowfreq(self, lo, hi, cell=90):
        gw, gh = max(2, self.w // cell), max(2, self.h // cell)
        small = Image.fromarray((self.nrng.random((gh, gw)) * 255).astype(np.uint8))
        big = np.asarray(small.resize((self.w, self.h), Image.BICUBIC), np.float32) / 255
        return lo + (hi - lo) * big

    def _grain(self):
        base = self.nrng.random((self.H, self.W)).astype(np.float32)
        im = Image.fromarray((base * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.55))
        im = im.resize((self.w, self.h), Image.BILINEAR)
        n = np.asarray(im, np.float32) / 255
        n = (n - n.mean()) / (n.std() + 1e-6) * 0.29 + 0.5
        return 0.08 + np.clip(n, 0, 1) * 0.92

    def save(self, name, quality=76):
        h, w = self.h, self.w
        rgb = np.ones((h, w, 3), np.float32)
        keep = np.ones((h, w), np.float32)
        for k, col in INKS.items():
            m = self.layers[k]
            if not m.any():
                continue
            ox, oy = self.rng.randint(-3, 3), self.rng.randint(-3, 3)
            m = np.roll(m, (oy, ox), axis=(0, 1)) * self._lowfreq(0.9, 1.0)
            n = self._grain()
            a = np.clip((m * 1.1 - n) / 0.16 + 0.5, 0, 1)
            voids = self.nrng.random((h, w)).astype(np.float32) < 0.015
            a[voids] *= 0.35
            ink = np.array(col, np.float32) / 255
            rgb *= 1 - a[..., None] * (1 - ink)
            keep *= 1 - a
        A = 1 - keep
        premult = rgb - keep[..., None]  # colour over white minus the white showing through
        # box-downsample premultiplied colour and alpha together
        premult = premult.reshape(self.H, SS, self.W, SS, 3).mean(axis=(1, 3))
        A = A.reshape(self.H, SS, self.W, SS).mean(axis=(1, 3))
        safe = np.where(A > 1e-3, A, 1)
        colour = np.clip(premult / safe[..., None], 0, 1)
        rgba = np.dstack([colour, A])
        img = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA")
        OUT.mkdir(parents=True, exist_ok=True)
        img.save(OUT / f"{name}.webp", "WEBP", quality=quality, method=6)
        PREVIEW.mkdir(parents=True, exist_ok=True)
        paper = Image.new("RGBA", img.size, PAPER + (255,))
        paper.alpha_composite(img)
        paper.convert("RGB").resize((img.width // 2, img.height // 2)).save(PREVIEW / f"{name}.png")
        print(f"  {name}.webp  {img.width}x{img.height}  {(OUT / f'{name}.webp').stat().st_size // 1024} KB")


# --- botanical primitives ----------------------------------------------------

LEAF_COMBOS = [
    ("gold", "teal"),
    ("gold", "teal"),
    ("gold", "rust"),
    ("rust", "teal"),
    ("teal", None),
    ("gold", None),
    ("rust", "gold"),
    ("teal", "gold"),
]


def leaf_poly(x, y, length, width, ang, bend, n=30):
    dx, dy = math.cos(ang), math.sin(ang)
    px, py = -dy, dx
    left, right, mid = [], [], []
    for i in range(n + 1):
        t = i / n
        off = bend * length * math.sin(PI * t)
        cx, cy = x + dx * length * t + px * off, y + dy * length * t + py * off
        hw = width * 0.5 * math.sin(PI * t**0.72) ** 0.85 * (1 - 0.12 * t)
        left.append((cx + px * hw, cy + py * hw))
        right.append((cx - px * hw, cy - py * hw))
        mid.append((cx, cy))
    return left + right[::-1], mid


def leaf(c, x, y, length, width, ang, bend=None, combo=None, rib=True):
    rng = c.rng
    if bend is None:
        bend = rng.uniform(-0.13, 0.13)
    base, over = combo or rng.choice(LEAF_COMBOS)
    poly, mid = leaf_poly(x, y, length, width, ang, bend)
    c.fill(base, ("poly", poly))
    if over:
        s0 = rng.uniform(0.18, 0.55)
        c.fill(
            over,
            ("poly", poly),
            grad=axis_grad(x, y, ang, length, s0, s0 + rng.uniform(0.25, 0.5), rng.random() < 0.3),
        )
    if rib:
        c.erase(("line", mid[2:-5], max(0.9, width * 0.06)), amount=0.72)


def branch(c, p, w0, w1, ink="gold", shade="rust", n=70):
    left, right, pts = [], [], []
    for i in range(n + 1):
        t = i / n
        x, y = bez(p, t)
        dx, dy = bez_d(p, t)
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln, dx / ln
        hw = (w0 + (w1 - w0) * t) / 2
        left.append((x + nx * hw, y + ny * hw))
        right.append((x - nx * hw, y - ny * hw))
        pts.append((x, y, math.atan2(dy, dx), hw))
    c.fill(ink, ("poly", left + right[::-1]))
    if shade:
        c.fill(shade, ("poly", [(x, y) for x, y, _, _ in pts] + right[::-1]), density=0.6)
    return pts


def gumnut(c, x, y, s, ang, body="rust", shade="teal", rim="rust", mouth="teal", stem="gold"):
    rng = c.rng
    dx, dy = math.cos(ang), math.sin(ang)
    px, py = -dy, dx
    length = s * 1.1
    left, right = [], []
    for i in range(23):
        t = i / 22
        hw = s * 0.5 * (0.32 + 0.68 * math.sin(PI / 2 * t) ** 0.6)
        cx, cy = x + dx * length * t, y + dy * length * t
        left.append((cx + px * hw, cy + py * hw))
        right.append((cx - px * hw, cy - py * hw))
    poly = left + right[::-1]
    c.fill(stem, ("line", [(x - dx * s * 0.45, y - dy * s * 0.45), (x + dx * s * 0.1, y + dy * s * 0.1)], max(1.4, s * 0.12)))
    c.fill(body, ("poly", poly), occlude=True)
    if shade:
        c.fill(shade, ("poly", poly), density=0.95, grad=side_grad(x, y, ang, s, 0.05, 0.95, rng.random() < 0.5))
    ox, oy = x + dx * length, y + dy * length
    c.fill(rim, ("poly", ellipse_poly(ox, oy, s * 0.54, s * 0.2, ang + PI / 2)))
    inner = ellipse_poly(ox + dx * s * 0.03, oy + dy * s * 0.03, s * 0.37, s * 0.12, ang + PI / 2)
    c.erase(("poly", inner))
    c.fill(mouth, ("poly", inner), density=0.9)


def nut_cluster(c, x, y, ang, s, count=3, ink="gold", palette=None):
    rng = c.rng
    palette = palette or [("rust", "teal", "rust", "teal"), ("gold", "rust", "gold", "teal"), ("teal", "gold", "teal", "rust")]
    spread = 0.55 if count > 1 else 0
    for i in range(count):
        a = ang + (i - (count - 1) / 2) * spread + rng.uniform(-0.12, 0.12)
        length = s * rng.uniform(0.7, 1.2)
        ex, ey = x + math.cos(a) * length, y + math.sin(a) * length
        c.fill(ink, ("line", [(x, y), ((x + ex) / 2 + rng.uniform(-3, 3), (y + ey) / 2), (ex, ey)], max(1.3, s * 0.08)))
        body, shade, rim, mouth = rng.choice(palette)
        gumnut(c, ex, ey, s * rng.uniform(0.85, 1.1), a, body, shade, rim, mouth, stem=ink)


def sprig(c, p, w0, leaves=14, lr=(60, 110), wr=(16, 26), nuts=2, nut_size=18, ink="gold", shade="rust", combos=None, taper=0.4, boost=1.3):
    rng = c.rng
    lr, wr = (lr[0] * boost, lr[1] * boost), (wr[0] * boost, wr[1] * boost)
    w0 *= min(boost, 1.2)
    pts = branch(c, p, w0, max(1.2, w0 * 0.14), ink, shade)
    n = len(pts)
    for k in range(leaves):
        t = min(0.98, 0.1 + 0.9 * (k + 0.5) / leaves + rng.uniform(-0.03, 0.03))
        x, y, a, _ = pts[int(t * (n - 1))]
        side = 1 if k % 2 else -1
        ang = a + side * rng.uniform(0.35, 1.0)
        length = rng.uniform(*lr) * (1 - taper * t)
        width = rng.uniform(*wr) * (1 - taper * 0.6 * t)
        sx, sy = x + math.cos(ang) * 5, y + math.sin(ang) * 5
        c.fill(ink, ("line", [(x, y), (sx, sy)], 1.6))
        leaf(c, sx, sy, length, width, ang, combo=rng.choice(combos) if combos else None)
    x, y, a, _ = pts[-1]
    leaf(c, x, y, lr[0] * 0.7, wr[0] * 0.7, a, combo=rng.choice(combos) if combos else None)
    for k in range(nuts):
        t = 0.3 + 0.55 * (k + 0.5) / max(nuts, 1)
        x, y, a, _ = pts[int(t * (n - 1))]
        side = -1 if k % 2 else 1
        tx, ty = x + math.cos(a + side * 0.9) * nut_size * 1.2, y + math.sin(a + side * 0.9) * nut_size * 1.2
        c.fill(ink, ("line", [(x, y), (tx, ty)], 1.8))
        nut_cluster(c, tx, ty, a + side * 0.9, nut_size, count=rng.choice([2, 3, 3]), ink=ink)
    return pts


def falling_leaves(c, count, box, lr=(50, 90), wr=(14, 22), boost=1.25):
    rng = c.rng
    lr, wr = (lr[0] * boost, lr[1] * boost), (wr[0] * boost, wr[1] * boost)
    x0, y0, x1, y1 = box
    for _ in range(count):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        leaf(c, x, y, rng.uniform(*lr), rng.uniform(*wr), rng.uniform(0, 2 * PI), bend=rng.uniform(-0.2, 0.2))


def sparkle(c, x, y, s, ink="gold", rot=0.0):
    pts = []
    for i in range(8):
        r = s if i % 2 == 0 else s * 0.28
        a = rot + i * PI / 4
        pts.append((x + math.cos(a) * r, y + math.sin(a) * r))
    c.fill(ink, ("poly", pts))


def confetti(c, count, box, size=(6, 14)):
    rng = c.rng
    x0, y0, x1, y1 = box
    for _ in range(count):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        w, h = rng.uniform(*size), rng.uniform(size[0] * 0.4, size[0] * 0.8)
        rect = xform([(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)], x, y, 1, rng.uniform(0, PI))
        c.fill(rng.choice(["gold", "teal", "rust"]), ("poly", rect))


def wreath(c, cx, cy, r, leaves=13, combos=None, gap=0.55, size=1.0):
    rng = c.rng
    for side in (-1, 1):
        start = PI / 2 + side * 0.25
        end = PI / 2 + side * (PI - gap)
        pts = []
        for i in range(40):
            a = start + (end - start) * i / 39
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
        c.fill("gold", ("line", pts, 5 * size))
        c.fill("rust", ("line", pts, 2.2 * size), density=0.7)
        for k in range(leaves):
            t = (k + 0.5) / leaves
            a = start + (end - start) * t
            x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
            tangent = a + side * PI / 2
            for out in (-1, 1):
                ang = tangent - out * 0.6 + rng.uniform(-0.1, 0.1)
                leaf(c, x, y, rng.uniform(58, 80) * size * (1 - 0.3 * t), rng.uniform(17, 23) * size, ang, combo=rng.choice(combos) if combos else None)
        bx, by = cx + math.cos(start) * r, cy + math.sin(start) * r
        nut_cluster(c, bx, by + 6, PI / 2 + side * 0.4, 16 * size, count=2)


# --- objects -------------------------------------------------------------------


def mortarboard(c, x, y, s, rot=0.0, board="teal", cap="teal", tassel="gold"):
    T = lambda pts: xform(pts, x, y, s, rot)
    capb = T([(-0.52, 0.05), (0.52, 0.05), (0.47, 0.55), (-0.47, 0.55)])
    c.fill(cap, ("poly", capb), occlude=True)
    c.fill("rust", ("poly", capb), density=0.75, grad=side_grad(x, y, rot, s * 1.1, -0.2, 1.0))
    c.fill(cap, ("poly", T(ellipse_poly(0, 0.55, 0.47, 0.13))))
    top = T([(-1.0, 0.0), (0.0, -0.42), (1.0, 0.0), (0.0, 0.42)])
    c.fill(board, ("poly", top), occlude=True)
    c.fill("ink", ("poly", top), density=0.35, grad=axis_grad(x, y, rot - PI / 2, s * 0.5, -0.6, 0.9))
    c.fill(tassel, ("line", T([(0.0, 0.0), (0.55, 0.12), (0.78, 0.18), (0.8, 0.62)]), max(1.6, s * 0.035)))
    c.fill(tassel, ("poly", T([(0.74, 0.58), (0.86, 0.58), (0.9, 0.92), (0.7, 0.92)])))
    c.fill(tassel, ("circle", *T([(0.0, 0.0)])[0], s * 0.07))


def book(c, x, y, s, rot=0.0):
    T = lambda pts: xform(pts, x, y, s, rot)
    cover = T([(-1.08, -0.52), (0, -0.42), (1.08, -0.52), (1.1, 0.5), (0, 0.6), (-1.1, 0.5)])
    c.fill("teal", ("poly", cover), occlude=True)
    c.fill("ink", ("poly", cover), density=0.3)
    for side in (-1, 1):
        page = []
        for i in range(21):
            t = i / 20
            page.append((side * t, -0.62 + 0.16 * math.sin(PI * t) ** 0.5 * -1 + 0.2 * t * t))
        page += [(side * 1.0, 0.42), (side * 0.5, 0.38), (0, 0.52)]
        pp = T(page)
        c.fill("gold", ("poly", pp), occlude=True, density=0.3)
        for k in range(6):
            yy = -0.3 + k * 0.12
            line = T([(side * 0.14, yy + 0.02), (side * 0.5, yy - 0.02), (side * 0.86, yy + 0.02)])
            c.fill("rust", ("line", line, max(1.2, s * 0.012)), density=0.65)
    c.fill("rust", ("line", T([(0, -0.55), (0, 0.5)]), max(1.5, s * 0.02)))


def coin_stack(c, x, y, rx, count, thick=None):
    ry = rx * 0.32
    thick = thick or rx * 0.22
    for i in range(count):
        cy = y - i * thick
        body = [(x + rx, cy - thick)] + ellipse_poly(x, cy, rx, ry, 0, 40, 0, PI) + [(x - rx, cy - thick)]
        c.fill("gold", ("poly", body), occlude=True)
        c.fill("rust", ("poly", body), density=0.75, grad=lambda X, Y, x=x, rx=rx: smooth(-0.2, 1.0, (X - x) / rx))
        for k in range(7):
            gx = x - rx + (k + 0.5) * 2 * rx / 7
            c.erase(("line", [(gx, cy - thick * 0.9 + ry * 0.2), (gx, cy + ry * math.sqrt(max(0, 1 - ((gx - x) / rx) ** 2)) * 0.9)], 1.2), amount=0.45)
    top = cy - thick if count else y
    c.fill("gold", ("poly", ellipse_poly(x, top, rx, ry)), occlude=True)
    c.erase(("line", ellipse_poly(x, top, rx * 0.78, ry * 0.74), 2.0), amount=0.7)
    c.fill("rust", ("poly", ellipse_poly(x, top, rx * 0.62, ry * 0.58)), density=0.4)


def envelope(c, x, y, s, rot=0.0, body="gold", flap="teal"):
    T = lambda pts: xform(pts, x, y, s, rot)
    rect = T([(-0.8, -0.5), (0.8, -0.5), (0.8, 0.5), (-0.8, 0.5)])
    c.fill(body, ("poly", rect), occlude=True, density=0.45)
    c.fill(flap, ("poly", T([(-0.8, -0.5), (0.8, -0.5), (0, 0.12)])), density=0.9)
    c.fill("rust", ("line", T([(-0.8, 0.5), (-0.12, -0.02)]), max(1.2, s * 0.02)), density=0.8)
    c.fill("rust", ("line", T([(0.8, 0.5), (0.12, -0.02)]), max(1.2, s * 0.02)), density=0.8)
    c.fill("rust", ("circle", *T([(0, 0.08)])[0], s * 0.09))


def paper_plane(c, x, y, s, rot=0.0):
    T = lambda pts: xform(pts, x, y, s, rot)
    c.fill("teal", ("poly", T([(-0.9, -0.55), (1.0, 0.0), (-0.25, 0.05)])), occlude=True)
    c.fill("gold", ("poly", T([(-0.9, 0.55), (1.0, 0.0), (-0.25, 0.05)])), occlude=True, density=0.9)
    c.fill("rust", ("poly", T([(-0.25, 0.05), (1.0, 0.0), (-0.45, 0.32)])), occlude=True)


def dashed(c, p, ink="rust", dash=0.035, width=2.4, density=0.85):
    t = 0.0
    while t < 1.0:
        seg = [bez(p, t + i * dash / 6) for i in range(7)]
        c.fill(ink, ("line", seg, width), density=density)
        t += dash * 2


def clock_sun(c, x, y, r):
    c.fill("gold", ("circle", x, y, r * 1.22), density=0.4)
    c.fill("gold", ("circle", x, y, r), occlude=True)
    c.fill("rust", ("circle", x, y, r), density=0.35, grad=side_grad(x, y, 0.6, r * 2, 0.1, 1.0))
    for i in range(12):
        a = i * PI / 6
        r0 = r * (0.74 if i % 3 else 0.66)
        c.erase(("line", [(x + math.cos(a) * r0, y + math.sin(a) * r0), (x + math.cos(a) * r * 0.88, y + math.sin(a) * r * 0.88)], 3.2 if i % 3 == 0 else 2.0), amount=0.85)
    c.fill("rust", ("line", [(x, y), (x + math.cos(-PI / 2.6) * r * 0.62, y + math.sin(-PI / 2.6) * r * 0.62)], 6))
    c.fill("rust", ("line", [(x, y), (x + math.cos(0.35) * r * 0.42, y + math.sin(0.35) * r * 0.42)], 7))
    c.fill("teal", ("circle", x, y, 9))


def certificate(c, x, y, s, rot=0.0):
    T = lambda pts: xform(pts, x, y, s, rot)
    sheet = T([(-1.0, -0.62), (1.0, -0.62), (1.0, 0.62), (-1.0, 0.62)])
    c.fill("gold", ("poly", sheet), occlude=True, density=0.32)
    for side in (-1, 1):
        roll = T(ellipse_poly(side * 1.02, 0, 0.1, 0.68))
        c.fill("gold", ("poly", roll), occlude=True)
        c.fill("rust", ("poly", roll), density=0.7, grad=side_grad(*T([(side * 1.02, 0)])[0], rot + PI / 2, s * 0.2))
    c.fill("teal", ("line", T([(-0.55, -0.36), (0.55, -0.36)]), max(2.0, s * 0.05)), density=0.9)
    for k in range(4):
        yy = -0.12 + k * 0.14
        c.fill("rust", ("line", T([(-0.7, yy), (0.7 - (0.4 if k == 3 else 0), yy)]), max(1.2, s * 0.018)), density=0.6)
    sx, sy = T([(0.58, 0.42)])[0]
    for tail in (-1, 1):
        c.fill("teal", ("poly", T([(0.58, 0.42), (0.58 + tail * 0.14, 0.86), (0.58 + tail * 0.05, 0.8), (0.58, 0.9)])))
    c.fill("rust", ("circle", sx, sy, s * 0.2), occlude=True)
    for i in range(16):
        a = i * PI / 8
        c.fill("rust", ("circle", sx + math.cos(a) * s * 0.2, sy + math.sin(a) * s * 0.2, s * 0.035))
    c.erase(("line", ellipse_poly(sx, sy, s * 0.13, s * 0.13), 1.6), amount=0.7)
    sparkle(c, sx, sy, s * 0.08, "gold")


def silhouette(c, x, y, s):
    c.fill("teal", ("poly", ellipse_poly(x, y + s * 0.95, s * 0.78, s * 0.62, 0, 48, PI, 2 * PI)), occlude=True)
    c.fill("gold", ("poly", ellipse_poly(x, y + s * 0.95, s * 0.78, s * 0.62, 0, 48, PI, 2 * PI)), density=0.8, grad=side_grad(x, y, 0, s * 1.6, 0.0, 1.0))
    c.fill("teal", ("circle", x, y, s * 0.38), occlude=True)
    c.fill("gold", ("circle", x, y, s * 0.38), density=0.85, grad=side_grad(x, y, 0, s * 0.76, 0.0, 1.0))


def clipboard(c, x, y, s, rot=0.0):
    T = lambda pts: xform(pts, x, y, s, rot)
    board = T([(-0.72, -0.95), (0.72, -0.95), (0.72, 0.95), (-0.72, 0.95)])
    c.fill("rust", ("poly", board), occlude=True, density=0.9)
    sheet = T([(-0.6, -0.8), (0.6, -0.8), (0.6, 0.85), (-0.6, 0.85)])
    c.fill("gold", ("poly", sheet), occlude=True, density=0.25)
    c.fill("teal", ("poly", T([(-0.3, -1.08), (0.3, -1.08), (0.36, -0.82), (-0.36, -0.82)])), occlude=True)
    for k in range(4):
        yy = -0.5 + k * 0.36
        box = T([(-0.45, yy - 0.1), (-0.25, yy - 0.1), (-0.25, yy + 0.1), (-0.45, yy + 0.1)])
        c.fill("teal", ("line", box + [box[0]], max(1.4, s * 0.025)))
        if k < 3:
            c.fill("rust", ("line", T([(-0.42, yy), (-0.35, yy + 0.08), (-0.2, yy - 0.16)]), max(2, s * 0.035)))
        c.fill("teal", ("line", T([(-0.12, yy), (0.45 - 0.12 * (k % 2), yy)]), max(1.4, s * 0.02)), density=0.6)


def bulb(c, x, y, s):
    glass = ellipse_poly(x, y, s, s * 1.02, 0, 60, PI * 0.78, PI * 2.22)
    glass += [(x + s * 0.34, y + s * 1.25), (x - s * 0.34, y + s * 1.25)]
    c.fill("gold", ("poly", glass), occlude=True, density=0.8, grad=radial_grad(x - s * 0.3, y - s * 0.3, s * 0.1, s * 1.5, reverse=True))
    c.fill("gold", ("circle", x, y, s * 1.45), density=0.2)
    leaf(c, x - s * 0.05, y + s * 0.9, s * 1.2, s * 0.42, -PI / 2 + 0.12, bend=0.12, combo=("teal", "gold"))
    for k in range(4):
        yy = y + s * 1.3 + k * s * 0.15
        c.fill("rust" if k % 2 == 0 else "teal", ("poly", [(x - s * 0.36, yy), (x + s * 0.36, yy), (x + s * 0.33, yy + s * 0.13), (x - s * 0.33, yy + s * 0.13)]), occlude=True)
    for i in range(9):
        a = -PI + i * PI / 8
        c.fill("rust", ("line", [(x + math.cos(a) * s * 1.28, y + math.sin(a) * s * 1.28), (x + math.cos(a) * s * 1.55, y + math.sin(a) * s * 1.55)], 4), density=0.8)


def chip(c, x, y, s, rot=0.0):
    T = lambda pts: xform(pts, x, y, s, rot)
    sq = T([(-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)])
    c.fill("rust", ("poly", sq), density=0.35, occlude=True)
    c.fill("rust", ("line", sq + [sq[0]], max(1.2, s * 0.03)))
    rng = c.rng
    for _ in range(5):
        a, b = rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4)
        path = T([(-0.5, a), (b, a), (b, 0.5 if rng.random() < 0.5 else -0.5)])
        c.fill("rust", ("line", path, max(1.2, s * 0.03)))
        c.fill("rust", ("circle", *path[1], s * 0.05))


def calendar(c, x, y, s, rot=0.0):
    T = lambda pts: xform(pts, x, y, s, rot)
    page = T([(-0.9, -0.7), (0.9, -0.7), (0.9, 0.85), (-0.9, 0.85)])
    c.fill("gold", ("poly", page), occlude=True, density=0.3)
    c.fill("teal", ("poly", T([(-0.9, -0.7), (0.9, -0.7), (0.9, -0.38), (-0.9, -0.38)])), density=0.95)
    for k in (-0.5, 0.5):
        c.fill("rust", ("line", T([(k, -0.85), (k, -0.55)]), max(3, s * 0.07)))
    for row in range(4):
        for col in range(5):
            cx, cy = -0.66 + col * 0.33, -0.18 + row * 0.26
            cell = T([(cx - 0.11, cy - 0.08), (cx + 0.11, cy - 0.08), (cx + 0.11, cy + 0.08), (cx - 0.11, cy + 0.08)])
            hot = (row, col) in ((1, 2), (2, 4), (3, 1))
            c.fill("rust" if hot else "teal", ("poly", cell), density=0.95 if hot else 0.35)


def columns(c, x, y, s):
    T = lambda pts: xform(pts, x, y, s, 0)
    c.fill("gold", ("poly", T([(-1.05, -0.62), (0, -1.05), (1.05, -0.62)])), occlude=True)
    c.fill("rust", ("poly", T([(-1.05, -0.62), (0, -1.05), (1.05, -0.62)])), density=0.5, grad=lambda X, Y: smooth(-0.1, 0.9, (X - x) / s))
    c.fill("gold", ("poly", T([(-1.0, -0.6), (1.0, -0.6), (1.0, -0.5), (-1.0, -0.5)])), occlude=True)
    for k in range(5):
        cx = -0.8 + k * 0.4
        col = T([(cx - 0.11, -0.46), (cx + 0.11, -0.46), (cx + 0.11, 0.55), (cx - 0.11, 0.55)])
        c.fill("teal", ("poly", col), occlude=True)
        c.fill("gold", ("poly", col), density=0.7, grad=lambda X, Y, cx=cx: smooth(-0.2, 1.0, (X - x - cx * s) / (0.11 * s)))
    for k, w in enumerate((1.05, 1.15, 1.25)):
        yy = 0.58 + k * 0.1
        c.fill("rust" if k % 2 else "gold", ("poly", T([(-w, yy), (w, yy), (w, yy + 0.09), (-w, yy + 0.09)])), occlude=True)


# --- scenes --------------------------------------------------------------------

HERO = (1600, 560)
SPOT = (720, 720)


def scene_home():
    c = Canvas(*HERO, seed=11)
    sprig(c, [(540, 540), (780, 330), (1100, 400), (1600, 150)], 30, leaves=30, lr=(120, 175), wr=(32, 44), nuts=3, nut_size=26, boost=1.0)
    sprig(c, [(860, 560), (960, 460), (1130, 470), (1280, 420)], 13, leaves=10, lr=(75, 110), wr=(22, 30), nuts=1, nut_size=20, boost=1.0)
    sprig(c, [(1200, 0), (1280, 110), (1420, 140), (1600, 290)], 12, leaves=11, lr=(75, 115), wr=(22, 30), nuts=1, nut_size=20, boost=1.0)
    falling_leaves(c, 4, (420, 40, 820, 220), lr=(70, 110), wr=(20, 28), boost=1.0)
    falling_leaves(c, 2, (1380, 380, 1560, 520), lr=(70, 110), wr=(20, 28), boost=1.0)
    c.save("hero-home")


def scene_degree():
    c = Canvas(*HERO, seed=23)
    combos = [("gold", "teal"), ("gold", "rust"), ("teal", "gold"), ("gold", None)]
    wreath(c, 1120, 300, 195, leaves=9, combos=combos)
    mortarboard(c, 1120, 290, 120, rot=-0.08)
    for x, y, s, ink in [(880, 110, 20, "gold"), (1380, 90, 26, "teal"), (1420, 440, 16, "rust"), (820, 420, 14, "teal"), (1250, 70, 12, "rust")]:
        sparkle(c, x, y, s, ink, rot=0.2)
    confetti(c, 30, (760, 40, 1560, 250), (7, 13))
    falling_leaves(c, 4, (450, 60, 760, 480))
    c.save("hero-degree")


def scene_enrolment():
    c = Canvas(*HERO, seed=37)
    sprig(c, [(1120, 330), (1050, 220), (900, 150), (760, 60)], 11, leaves=10, lr=(60, 100), wr=(18, 26), nuts=1, nut_size=16)
    sprig(c, [(1130, 330), (1180, 200), (1330, 150), (1500, 40)], 12, leaves=11, lr=(60, 100), wr=(18, 26), nuts=2, nut_size=16)
    sprig(c, [(1125, 330), (1120, 240), (1150, 150), (1140, 40)], 8, leaves=7, lr=(45, 75), wr=(14, 20), nuts=0)
    book(c, 1120, 420, 220, rot=0.02)
    for x, y in [(700, 470), (1440, 480), (1520, 330)]:
        gumnut(c, x, y, 22, c.rng.uniform(0, 2 * PI))
    falling_leaves(c, 4, (420, 80, 720, 460))
    c.save("hero-enrolment")


def scene_timetable():
    c = Canvas(*HERO, seed=41)
    cx, cy = 1100, 280
    for p, w in [
        ([(640, 0), (800, 100), (900, 160), (1010, 220)], 20),
        ([(1600, 0), (1450, 80), (1300, 140), (1200, 210)], 22),
        ([(640, 560), (800, 480), (920, 420), (1010, 350)], 18),
        ([(1600, 560), (1470, 470), (1330, 420), (1210, 360)], 22),
        ([(1100, 0), (1080, 60), (1110, 110), (1100, 150)], 8),
        ([(1100, 560), (1120, 500), (1090, 450), (1100, 420)], 8),
    ]:
        sprig(c, p, w, leaves=12 if w > 10 else 5, lr=(60, 105), wr=(18, 28), nuts=1 if w > 10 else 0, nut_size=16)
    clock_sun(c, cx, cy, 110)
    falling_leaves(c, 4, (420, 80, 640, 480))
    c.save("hero-timetable")


def scene_account():
    c = Canvas(*HERO, seed=53)
    sprig(c, [(760, 560), (880, 360), (1100, 260), (1560, 90)], 18, leaves=18, lr=(70, 115), wr=(20, 30), nuts=2, nut_size=18)
    columns(c, 1390, 330, 130)
    for x, n in [(960, 6), (1090, 9), (1210, 4)]:
        coin_stack(c, x, 520, 58, n)
    for x, y in [(840, 500), (1290, 520), (1560, 520)]:
        gumnut(c, x, y, 20, c.rng.uniform(-PI, 0), body="gold", shade="rust", rim="gold")
    sparkle(c, 1020, 180, 22, "gold")
    sparkle(c, 1200, 120, 14, "teal")
    falling_leaves(c, 4, (420, 60, 760, 460))
    c.save("hero-account")


def scene_records():
    c = Canvas(*HERO, seed=67)
    sprig(c, [(760, 80), (900, 180), (1000, 150), (1080, 120)], 11, leaves=9, lr=(55, 95), wr=(16, 24), nuts=1, nut_size=15)
    sprig(c, [(1580, 520), (1480, 420), (1380, 460), (1300, 420)], 12, leaves=10, lr=(55, 95), wr=(16, 24), nuts=1, nut_size=15)
    certificate(c, 1120, 300, 230, rot=-0.06)
    for x, y, s, ink in [(820, 400, 18, "teal"), (1420, 110, 24, "gold"), (1500, 230, 12, "rust")]:
        sparkle(c, x, y, s, ink)
    falling_leaves(c, 4, (420, 60, 740, 480))
    c.save("hero-records")


def scene_graduation():
    c = Canvas(*HERO, seed=71)
    for x, y, s, r in [(900, 170, 95, -0.35), (1110, 330, 130, 0.12), (1340, 150, 105, 0.4), (1480, 390, 80, -0.2), (760, 400, 70, 0.3)]:
        mortarboard(c, x, y, s, rot=r)
    confetti(c, 70, (600, 20, 1590, 540), (7, 15))
    for x, y, s, ink in [(1000, 60, 22, "gold"), (1240, 480, 18, "teal"), (1560, 80, 20, "rust"), (680, 120, 14, "gold")]:
        sparkle(c, x, y, s, ink, rot=0.3)
    falling_leaves(c, 8, (420, 40, 1580, 520), lr=(40, 70), wr=(12, 18))
    c.save("hero-graduation")


def scene_messages():
    c = Canvas(*HERO, seed=79)
    dashed(c, [(620, 460), (820, 520), (900, 250), (1260, 190)], density=0.8)
    paper_plane(c, 1320, 170, 110, rot=-0.35)
    envelope(c, 1000, 380, 130, rot=-0.12)
    envelope(c, 1250, 420, 95, rot=0.18, body="teal", flap="gold")
    sprig(c, [(1600, 560), (1520, 440), (1500, 330), (1420, 260)], 12, leaves=9, lr=(55, 90), wr=(16, 24), nuts=1, nut_size=15)
    falling_leaves(c, 6, (430, 50, 900, 300))
    c.save("hero-messages")


def scene_personal():
    c = Canvas(*HERO, seed=83)
    combos = [("gold", "teal"), ("teal", "gold"), ("rust", "teal"), ("gold", "rust")]
    wreath(c, 1120, 290, 190, leaves=9, combos=combos)
    silhouette(c, 1120, 230, 115)
    sparkle(c, 1400, 100, 20, "rust")
    sparkle(c, 850, 130, 16, "teal")
    falling_leaves(c, 5, (430, 60, 800, 480))
    c.save("hero-personal")


def scene_requests():
    c = Canvas(*HERO, seed=89)
    sprig(c, [(820, 560), (900, 400), (980, 330), (1010, 200)], 12, leaves=10, lr=(55, 95), wr=(16, 24), nuts=1, nut_size=16)
    clipboard(c, 1160, 290, 190, rot=0.06)
    dashed(c, [(1300, 420), (1420, 480), (1500, 300), (1440, 150)], ink="teal")
    paper_plane(c, 1440, 130, 70, rot=-1.4)
    falling_leaves(c, 5, (430, 60, 800, 480))
    c.save("hero-requests")


def scene_resources():
    c = Canvas(*HERO, seed=97)
    bulb(c, 1120, 210, 95)
    rng = c.rng
    for x, y in [(820, 120), (1420, 90), (1500, 420), (880, 440), (1300, 470)]:
        chip(c, x + rng.uniform(-20, 20), y + rng.uniform(-20, 20), rng.uniform(54, 70), rng.uniform(-0.4, 0.4))
    for x, y in [(960, 300), (1330, 300), (1560, 250), (760, 300), (1190, 500)]:
        gumnut(c, x, y, rng.uniform(22, 28), rng.uniform(0, 2 * PI))
    sprig(c, [(1600, 0), (1520, 120), (1480, 200), (1390, 230)], 10, leaves=7, lr=(50, 80), wr=(15, 22), nuts=0)
    falling_leaves(c, 7, (560, 40, 1580, 520), lr=(60, 100), wr=(18, 26))
    c.save("hero-resources")


def spot_sprig():
    c = Canvas(*SPOT, seed=101)
    sprig(c, [(120, 640), (260, 470), (400, 330), (620, 110)], 14, leaves=13, lr=(70, 115), wr=(22, 30), nuts=2, nut_size=22)
    c.save("spot-sprig")


def spot_cap():
    c = Canvas(*SPOT, seed=103)
    combos = [("gold", "teal"), ("gold", "rust"), ("teal", "gold")]
    wreath(c, 360, 380, 240, leaves=8, combos=combos, size=1.15)
    mortarboard(c, 360, 360, 150, rot=-0.1)
    confetti(c, 26, (80, 40, 640, 240), (9, 16))
    sparkle(c, 140, 150, 26, "gold")
    sparkle(c, 590, 120, 20, "teal")
    c.save("spot-cap")


def spot_calendar():
    c = Canvas(*SPOT, seed=107)
    sprig(c, [(60, 700), (160, 560), (220, 420), (200, 260)], 11, leaves=9, lr=(60, 95), wr=(18, 26), nuts=1, nut_size=18)
    calendar(c, 400, 380, 210, rot=0.06)
    sprig(c, [(700, 120), (620, 180), (560, 150), (500, 110)], 7, leaves=6, lr=(45, 70), wr=(14, 20), nuts=0)
    c.save("spot-calendar")


def spot_coins():
    c = Canvas(*SPOT, seed=109)
    sprig(c, [(60, 640), (200, 420), (420, 300), (680, 120)], 12, leaves=11, lr=(60, 100), wr=(18, 26), nuts=1, nut_size=18)
    for x, n in [(260, 5), (400, 8), (530, 3)]:
        coin_stack(c, x, 620, 64, n)
    sparkle(c, 560, 200, 24, "gold")
    c.save("spot-coins")


def pattern():
    c = Canvas(1200, 800, seed=113)
    rng = c.rng
    for gy in range(5):
        for gx in range(7):
            x = gx * 180 + (90 if gy % 2 else 0) + rng.uniform(-30, 30)
            y = gy * 170 + rng.uniform(-30, 30)
            if rng.random() < 0.35:
                gumnut(c, x, y, rng.uniform(16, 22), rng.uniform(0, 2 * PI))
            else:
                leaf(c, x, y, rng.uniform(70, 110), rng.uniform(20, 28), rng.uniform(0, 2 * PI))
    c.save("pattern", quality=70)


SCENES = {
    "home": scene_home,
    "degree": scene_degree,
    "enrolment": scene_enrolment,
    "timetable": scene_timetable,
    "account": scene_account,
    "records": scene_records,
    "graduation": scene_graduation,
    "messages": scene_messages,
    "personal": scene_personal,
    "requests": scene_requests,
    "resources": scene_resources,
    "spot-sprig": spot_sprig,
    "spot-cap": spot_cap,
    "spot-calendar": spot_calendar,
    "spot-coins": spot_coins,
    "pattern": pattern,
}

if __name__ == "__main__":
    wanted = sys.argv[1:] or list(SCENES)
    for name in wanted:
        SCENES[name]()
