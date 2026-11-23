"""
Нарезка фото для главной страницы из панорам (site/tour/images/pano/*-8k.jpg).
Результат: site/img/*.webp

Каждый кадр: (имя, сцена, cx, cy, hf, aspect)
  cx, cy — центр кадра (доля ширины/высоты панорамы)
  hf     — высота кадра (доля высоты панорамы)
  aspect — ширина / высота кадра
Запуск: python tools/make_site_images.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PANO = ROOT / "site" / "tour" / "images" / "pano"
OUT = ROOT / "site" / "img"

CROPS = [
    # зоны
    ("zone-slides",     "05-vatrushka",        0.665, 0.58, 0.62, 4 / 3),
    ("zone-climb",      "05-vatrushka",        0.79,  0.50, 0.80, 3 / 4),
    ("zone-ninja",      "04-nachalo",          0.73,  0.48, 0.90, 4 / 3),
    ("zone-zipline",    "11-zipline",          0.45,  0.50, 0.95, 4 / 3),
    ("zone-trampoline", "06-batut",            0.84,  0.66, 0.62, 4 / 3),
    ("zone-foam",       "06-batut",            0.17,  0.70, 0.55, 4 / 3),
    ("zone-ballpool",   "08-bigdryballpool",   0.27,  0.55, 0.85, 4 / 3),
    ("zone-tubes",      "08-bigdryballpool",   0.60,  0.50, 0.85, 4 / 3),
    ("zone-town",       "07-detskaya",         0.80,  0.50, 0.95, 4 / 3),
    ("zone-carousel",   "09-karusel",          0.56,  0.52, 0.85, 4 / 3),
    ("zone-arcade",     "13-2ndfloor-2",       0.25,  0.45, 0.75, 4 / 3),
    ("zone-shooting",   "13-2ndfloor-2",       0.84,  0.50, 0.90, 4 / 3),
    ("zone-vr",         "15-2ndfloor-4",       0.25,  0.60, 0.75, 4 / 3),
    ("zone-parents",    "10-parentschillzone", 0.80,  0.58, 0.75, 4 / 3),
    # VIP-комнаты
    ("vip-small",       "16-vip1small",        0.47,  0.52, 0.92, 3 / 2),
    ("vip-big",         "17-vip2big",          0.62,  0.55, 0.88, 3 / 2),
    # как нас найти
    ("way-mall",        "01-mall-entrance",    0.50,  0.50, 0.95, 4 / 3),
    ("way-apollo",      "02-apollo-entrance",  0.49,  0.48, 0.92, 4 / 3),
    ("way-reception",   "03-entrance",         0.42,  0.52, 0.90, 4 / 3),
]

# полосы для анимированной шапки (панорама целиком, без части потолка и пола)
STRIPS = [
    ("hero-strip",    "08-bigdryballpool", 0.10, 0.92, 1100),
    ("hero-strip-sm", "08-bigdryballpool", 0.10, 0.92, 720),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cache = {}

    def pano(scene):
        if scene not in cache:
            cache[scene] = Image.open(PANO / f"{scene}-8k.jpg").convert("RGB")
        return cache[scene]

    for name, scene, cx, cy, hf, aspect in CROPS:
        im = pano(scene)
        W, H = im.size
        h = H * hf
        w = min(h * aspect, W)
        x0 = min(max(cx * W - w / 2, 0), W - w)
        y0 = min(max(cy * H - h / 2, 0), H - h)
        crop = im.crop((round(x0), round(y0), round(x0 + w), round(y0 + h)))
        tw = 1000 if aspect >= 1 else 720
        crop = crop.resize((tw, round(tw / aspect)), Image.LANCZOS)
        out = OUT / f"{name}.webp"
        crop.save(out, "WEBP", quality=78, method=6)
        print(f"{out.name:24} {crop.size}  {out.stat().st_size // 1024} KB")

    for name, scene, top, bottom, th in STRIPS:
        im = pano(scene)
        W, H = im.size
        band = im.crop((0, round(H * top), W, round(H * bottom)))
        tw = round(band.width * th / band.height)
        band = band.resize((tw, th), Image.LANCZOS)
        out = OUT / f"{name}.webp"
        band.save(out, "WEBP", quality=70, method=6)
        print(f"{out.name:24} {band.size}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
