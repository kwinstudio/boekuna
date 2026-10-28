#!/usr/bin/env python3
"""Synthetic sample photos for simulator screenshots only (no personal images).
Creates ~40 images: distinct scenes, near-duplicate bursts (same minute), blurry shots,
receipts and photos dated on today's date in earlier years."""
import datetime as dt, random, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
random.seed(7)
today = dt.datetime.now()

def scene(seed, w=1200, h=1600, shift=0):
    r = random.Random(seed)
    sky = (r.randint(90, 240), r.randint(110, 210), r.randint(140, 250))
    img = Image.new('RGB', (w, h), sky)
    d = ImageDraw.Draw(img)
    sun = (r.randint(200, 255), r.randint(180, 240), r.randint(120, 200))
    cx, cy = r.randint(200, w - 200) + shift, r.randint(200, h // 3)
    d.ellipse([cx - 120, cy - 120, cx + 120, cy + 120], fill=sun)
    for layer in range(3):
        col = tuple(max(0, c - 60 * (layer + 1) + r.randint(-20, 20)) for c in sky)
        base = h // 2 + layer * h // 8
        pts = [(0, h)] + [(x, base - r.randint(0, h // 5)) for x in range(0, w + 200, 200)] + [(w, h)]
        pts = [(x + shift, y) for x, y in pts]
        d.polygon(pts, fill=col)
    return img

def receipt():
    img = Image.new('RGB', (900, 1600), (245, 244, 238))
    d = ImageDraw.Draw(img)
    for y in range(120, 1500, 60):
        d.rectangle([90, y, 90 + random.randint(300, 700), y + 18], fill=(60, 60, 60))
    return img

def save(img, name, when):
    exif = Image.Exif()
    exif[0x0132] = when.strftime('%Y:%m:%d %H:%M:%S')
    exif[0x9003] = when.strftime('%Y:%m:%d %H:%M:%S')
    img.save(out / name, 'JPEG', quality=88, exif=exif.tobytes())

n = 0
for i in range(18):  # distinct scenes over recent months
    when = today - dt.timedelta(days=3 + i * 9, hours=i)
    img = scene(100 + i, *( (1600, 1200) if i % 4 == 0 else (1200, 1600) ))
    save(img, f'scene-{i:02}.jpg', when); n += 1
for b in range(3):  # bursts: near-duplicates within one minute
    base = today - dt.timedelta(days=1 + b * 2, hours=2)
    for k in range(4):
        save(scene(500 + b, shift=k * 6), f'burst-{b}-{k}.jpg', base + dt.timedelta(seconds=k * 4)); n += 1
for i in range(3):  # blurry
    save(scene(800 + i).filter(ImageFilter.GaussianBlur(28)), f'blur-{i}.jpg', today - dt.timedelta(days=20 + i)); n += 1
for i in range(2):  # receipts / notes
    save(receipt(), f'receipt-{i}.jpg', today - dt.timedelta(days=30 + i)); n += 1
for y in range(2019, today.year):  # on this day, earlier years
    save(scene(900 + y), f'onthisday-{y}.jpg', today.replace(year=y, hour=15)); n += 1
print(f'{n} sample photos in {out}')
