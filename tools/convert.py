"""
Конвертация панорам iPhone (HEIC/JPG) для веб-тура.

Оригиналы в ../panoramas НЕ изменяются. Результат:
  site/images/pano/<name>-8k.jpg   — для компьютеров (ширина 8192)
  site/images/pano/<name>-4k.jpg   — для телефонов  (ширина 4096)
  site/images/thumbs/<name>.jpg    — миниатюра 480x270
  tools/images.json                — размеры и рассчитанные haov/vaov

Запуск:  python tools/convert.py
Нужно:   pip install pillow pillow-heif
"""
import io
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageCms, ImageOps
import pillow_heif

pillow_heif.register_heif_opener()

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "panoramas"
OUT_PANO = ROOT / "site" / "tour" / "images" / "pano"
OUT_THUMB = ROOT / "site" / "tour" / "images" / "thumbs"
MANIFEST = Path(__file__).resolve().parent / "images.json"

SIZES = {"8k": (8192, 84), "4k": (4096, 80)}  # ширина, качество JPEG
THUMB = (480, 270)

# Вертикальный угол обзора панорамы iPhone (основная камера, телефон вертикально,
# с учётом обрезки стабилизацией). Если на панораме заметны растяжения/сжатия —
# поправьте haov/vaov в tour-config.json или в режиме редактора.
VAOV_DEG = 60.0

SRGB = ImageCms.createProfile("sRGB")


def to_srgb(im: Image.Image) -> Image.Image:
    icc = im.info.get("icc_profile")
    im = im.convert("RGB")
    if icc:
        try:
            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            im = ImageCms.profileToProfile(im, src, SRGB, outputMode="RGB")
        except Exception as e:  # профиль битый — оставляем как есть
            print(f"  ! не удалось применить ICC: {e}")
    return im


# iPhone сохраняет панораму в цилиндрической проекции:
#   высота = 2·f·tan(VAOV/2),  ширина = f·haov.
# Pannellum показывает равнопромежуточную проекцию, поэтому берём такие vaov/haov,
# чтобы масштаб в центре кадра был одинаковым по обеим осям (без растяжения):
#   vaov = 2·tan(VAOV/2) рад,  haov = w/h · vaov.
PANNELLUM_VAOV = round(math.degrees(2 * math.tan(math.radians(VAOV_DEG / 2))), 1)


def calc_haov(w: int, h: int) -> float:
    return round(min(w / h * PANNELLUM_VAOV, 360.0), 1)


def main():
    OUT_PANO.mkdir(parents=True, exist_ok=True)
    OUT_THUMB.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in SRC.iterdir()
                   if p.suffix.lower() in (".heic", ".heif", ".jpg", ".jpeg", ".png"))
    if not files:
        sys.exit(f"Нет файлов в {SRC}")

    manifest = {}
    for p in files:
        name = p.stem.lower()
        print(f"→ {p.name}")
        im = ImageOps.exif_transpose(Image.open(p))
        im = to_srgb(im)
        w, h = im.size

        for tag, (tw, q) in SIZES.items():
            tw = min(tw, w)
            th = round(h * tw / w)
            out = OUT_PANO / f"{name}-{tag}.jpg"
            im.resize((tw, th), Image.LANCZOS).save(
                out, "JPEG", quality=q, optimize=True, progressive=True)
            print(f"   {out.name}  {tw}x{th}  {out.stat().st_size/1e6:.1f} MB")

        # миниатюра — центральная часть панорамы
        cw = round(h * THUMB[0] / THUMB[1])
        left = max(0, (w - cw) // 2)
        thumb = im.crop((left, 0, left + min(cw, w), h)).resize(THUMB, Image.LANCZOS)
        thumb.save(OUT_THUMB / f"{name}.jpg", "JPEG", quality=78, optimize=True, progressive=True)

        manifest[name] = {"source": p.name, "width": w, "height": h,
                          "haov": calc_haov(w, h), "vaov": PANNELLUM_VAOV}

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nГотово: {len(files)} панорам. Манифест: {MANIFEST}")


if __name__ == "__main__":
    main()
