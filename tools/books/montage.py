#!/usr/bin/env python3
"""Tile a lesson's stills into one contact sheet: python3 tools/books/montage.py <shots dir> [scale]"""
import pathlib, sys
from PIL import Image, ImageDraw

d = pathlib.Path(sys.argv[1])
scale = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
groups = {}
for p in sorted(d.glob('[0-9][0-9]-*.png')):
    groups.setdefault(p.name[:2], []).append(p)
for key, files in groups.items():
    files.sort(key=lambda p: int(p.stem.split('-')[1]))
    ims = [Image.open(f) for f in files]
    w, h = int(ims[0].width * scale), int(ims[0].height * scale)
    cols = 2
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * w, rows * h), 'white')
    for i, im in enumerate(ims):
        im = im.convert('RGB').resize((w, h))
        x, y = (i % cols) * w, (i // cols) * h
        sheet.paste(im, (x, y))
        ImageDraw.Draw(sheet).text((x + 8, y + 8), files[i].stem, fill=(200, 0, 0))
    sheet.save(d / f'sheet-{key}.png')
    print(d / f'sheet-{key}.png')
