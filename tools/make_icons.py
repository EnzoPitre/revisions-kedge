"""Génère les icônes PWA (logo « livre ouvert ») dans assets/icons/. Usage : python3 tools/make_icons.py"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icons')
BG = (28, 28, 31)
FG = (255, 255, 255)

def bez(p0, p1, p2, n=40):
    return [((1-t)**2*p0[0]+2*(1-t)*t*p1[0]+t*t*p2[0], (1-t)**2*p0[1]+2*(1-t)*t*p1[1]+t*t*p2[1]) for t in [i/n for i in range(n+1)]]

def book_paths():
    # coordonnées sur une grille 512
    left = bez((96, 190), (176, 160), (256, 200)) + bez((256, 200), (336, 160), (416, 190))[1:]
    bottom = bez((416, 350), (336, 320), (256, 360)) + bez((256, 360), (176, 320), (96, 350))[1:]
    outline = left + [(416, 350)] + bottom[1:] + [(96, 190)]
    spine = [(256, 200), (256, 360)]
    return [outline, spine]

def stroke(d, pts, w, fill):
    for a, b in zip(pts, pts[1:]):
        d.line([a, b], fill=fill, width=w)
    for x, y in pts:
        d.ellipse([x - w/2, y - w/2, x + w/2, y + w/2], fill=fill)

def render(size, rounded=True, scale=1.0):
    S = 4
    N = size * S
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, N-1, N-1], radius=int(N*0.2266), fill=BG)
    else:
        d.rectangle([0, 0, N, N], fill=BG)
    k = N / 512 * scale
    off = N * (1 - scale) / 2
    w = max(2, int(36 * k))
    for path in book_paths():
        stroke(d, [(x*k+off, y*k+off) for x, y in path], w, FG)
    return img.resize((size, size), Image.LANCZOS)

os.makedirs(OUT, exist_ok=True)
render(192).save(f'{OUT}/icon-192.png')
render(512).save(f'{OUT}/icon-512.png')
render(512, rounded=False, scale=0.72).save(f'{OUT}/icon-maskable-512.png')
render(180, rounded=False, scale=0.86).convert('RGB').save(f'{OUT}/apple-touch-icon.png')
render(32).save(f'{OUT}/favicon-32.png')
print('ok')
