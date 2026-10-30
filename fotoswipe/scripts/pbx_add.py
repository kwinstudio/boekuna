#!/usr/bin/env python3
"""Add files to the Fotoswipe app (or test) target in the compact project.pbxproj.

Usage: pbx_add.py [--tests] [--resource] File.swift [...]
Swift files go to the Sources phase, other files (with --resource) to Resources.
Idempotent: files already referenced are skipped.
"""
import hashlib, re, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
pbx = root / 'Fotoswipe.xcodeproj/project.pbxproj'
text = pbx.read_text()

APP_GROUP, TEST_GROUP = '69F8D45498D7E20DA99BB780', 'BFC937463906E5DB7A02A37C'
APP_SOURCES, TEST_SOURCES = '905DB04043B7311D06A28734', '7CB9C5DBBDFFE89694C24C30'
APP_RESOURCES = '0189424A5A60FED329FA868E'
TYPES = {'.swift': 'sourcecode.swift', '.xcstrings': 'text.json.xcstrings', '.json': 'text.json',
         '.plist': 'text.plist.xml', '.entitlements': 'text.plist.entitlements'}

def uid(seed):
    return hashlib.sha1(seed.encode()).hexdigest()[:24].upper()

def append_to_list(obj_id, key, value):
    global text
    pattern = re.compile(r'(^' + obj_id + r' = \{.*?\b' + key + r' = \()([^)]*)(\))', re.M)
    match = pattern.search(text)
    assert match, (obj_id, key)
    text = text[:match.start(2)] + match.group(2) + value + ',' + text[match.end(2):]

args = sys.argv[1:]
tests = '--tests' in args
resource = '--resource' in args
for name in [a for a in args if not a.startswith('--')]:
    if f'path = "{name}";' in text:
        print('skip', name); continue
    kind = TYPES.get(Path(name).suffix, 'file')
    ref, build = uid('ref' + name), uid('build' + name)
    line = (f'{ref} = {{ isa = PBXFileReference; lastKnownFileType = {kind}; path = "{name}"; sourceTree = "<group>"; }};\n'
            f'{build} = {{ isa = PBXBuildFile; fileRef = {ref}; }};\n')
    text = text.replace('objects = {\n', 'objects = {\n' + line, 1)
    append_to_list(TEST_GROUP if tests else APP_GROUP, 'children', ref)
    if name.endswith('.swift'):
        append_to_list(TEST_SOURCES if tests else APP_SOURCES, 'files', build)
    elif resource:
        append_to_list(APP_RESOURCES, 'files', build)
    print('added', name)
pbx.write_text(text)
