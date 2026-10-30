#!/usr/bin/env python3
"""Builds Localizable.xcstrings and InfoPlist.xcstrings from per-language JSON files.

Input: a folder with keys.json (list of source keys, Dutch text) and <lang>.json for each language
({key: "text"} or {key: {"one": "...", "other": "..."}} for plurals). Dutch values default to the key.
Every key must be present in every language; the script stops otherwise.
"""
import json, sys
from pathlib import Path

LANGS = ['en', 'nl', 'es', 'de', 'fr', 'ja']
INFO_KEYS = {'CFBundleDisplayName', 'CFBundleName', 'NSPhotoLibraryUsageDescription', 'NSContactsUsageDescription'}

src = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / 'Fotoswipe'
keys = json.loads((src / 'keys.json').read_text())
tables = {lang: json.loads((src / f'{lang}.json').read_text()) if (src / f'{lang}.json').exists() else {} for lang in LANGS}

def unit(value):
    return {'stringUnit': {'state': 'translated', 'value': value}}

def entry(value):
    if isinstance(value, dict):
        forms = {k: unit(v) for k, v in value.items() if k in ('zero', 'one', 'two', 'few', 'many', 'other')}
        assert 'other' in forms, value
        return {'variations': {'plural': forms}}
    return unit(value)

missing = []
catalogs = {'Localizable': {}, 'InfoPlist': {}}
for key in keys:
    locs = {}
    for lang in LANGS:
        value = tables[lang].get(key)
        if value is None and lang == 'nl':
            value = key
        if value is None or value == '':
            if key in ('CFBundleDisplayName', 'CFBundleName'):
                value = 'Fotoswipe'
            else:
                missing.append((lang, key)); continue
        locs[lang] = entry(value)
    catalogs['InfoPlist' if key in INFO_KEYS else 'Localizable'][key] = {'extractionState': 'manual', 'localizations': locs}

if missing:
    for lang, key in missing[:40]:
        print('MISSING', lang, repr(key))
    sys.exit(f'{len(missing)} missing translations')

for name, strings in catalogs.items():
    data = {'sourceLanguage': 'en', 'strings': dict(sorted(strings.items())), 'version': '1.0'}
    (out / f'{name}.xcstrings').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(f'{name}.xcstrings: {len(strings)} keys x {len(LANGS)} languages')
