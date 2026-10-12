#!/usr/bin/env python3
"""Independent Poppler extraction and raster regression. Needs Node, Poppler, Pillow."""
import os
import subprocess
import tempfile
from pathlib import Path
from PIL import Image

with tempfile.TemporaryDirectory(prefix='openweb-pdf-render-') as tmp:
    pdf = Path(tmp) / 'visible.pdf'
    subprocess.run(['node', 'scripts/test-pdf.mjs'], env={**os.environ, 'PDF_RENDER_FIXTURE': str(pdf)}, check=True)
    text = subprocess.run(['pdftotext', str(pdf), '-'], check=True, capture_output=True, text=True)
    assert not text.stderr, text.stderr
    expected = '廣東話香港嘅離線文件ABCé123'
    assert ''.join(text.stdout.split()) == expected, text.stdout
    render = subprocess.run(['pdftoppm', '-r', '144', '-singlefile', '-png', str(pdf), str(Path(tmp)/'visible')], check=True, capture_output=True)
    assert not render.stderr, render.stderr.decode()
    image = Image.open(Path(tmp)/'visible.png').convert('L')
    cells = []
    for index, char in enumerate(expected):
        # PDF baseline y=784-15*i, A4 height=841.89, 144 dpi (2 pixels/point).
        baseline = round((841.89 - (784 - index*15))*2)
        crop = image.crop((94, baseline-25, 125, baseline+4))
        ink = sum(pixel < 180 for pixel in crop.tobytes())
        assert ink > 8, f'Missing visible glyph {char!r}: {ink} dark pixels'
        cells.append(crop.tobytes())
    assert len(set(cells)) == len(expected), 'Repeated replacement boxes instead of distinct glyphs'
    print('Independent PDF text extraction and all 17 visible glyph cells passed.')
