#!/usr/bin/env python3
"""Reproduce the bundled static font; input must be the pinned official font."""
import hashlib
import sys
import fontTools
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

assert fontTools.__version__ == '4.61.1', 'Use FontTools 4.61.1'
source, destination = sys.argv[1:]
assert hashlib.sha256(open(source, 'rb').read()).hexdigest() == 'ac091cc8cd19e848202afc8fe6d3809b4526c8fdbdb4be82da20c4f785949591', 'Unexpected font source'
font = TTFont(source, recalcTimestamp=False)
instantiateVariableFont(font, {'wght': 400}, inplace=True)
# Avoid all upstream family names in the derivative's user-facing identity.
for record in font['name'].names:
    values = {1: 'Material Offline TC', 2: 'Regular', 3: 'MaterialOfflineTC-Regular-1',
              4: 'Material Offline TC Regular', 6: 'MaterialOfflineTC-Regular',
              16: 'Material Offline TC', 17: 'Regular'}
    if record.nameID in values:
        record.string = values[record.nameID].encode(record.getEncoding())
font.save(destination, reorderTables=True)
print(hashlib.sha256(open(destination, 'rb').read()).hexdigest())
