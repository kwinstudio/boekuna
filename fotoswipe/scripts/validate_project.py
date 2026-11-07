#!/usr/bin/env python3
"""Structural checks only. This does not compile Swift or run the iOS app."""
import json, plistlib, re, xml.etree.ElementTree as ET
from pathlib import Path
import struct

root = Path(__file__).resolve().parent.parent
source = (root / 'Fotoswipe.xcodeproj/project.pbxproj').read_text()
source = re.sub(r'//[^\n]*', '', source)
tokens = re.findall(r'"(?:\\.|[^"\\])*"|[^\s{}()=;,]+|[{}()=;,]', source)
position = 0

def pop():
    global position
    token = tokens[position]
    position += 1
    return token

def expect(token):
    actual = pop()
    assert actual == token, (actual, token)

def value():
    token = pop()
    if token == '{':
        result = {}
        while tokens[position] != '}':
            key = pop()
            if key.startswith('"'): key = json.loads(key)
            expect('=')
            assert key not in result, ('Duplicate dictionary key', key)
            result[key] = value()
            expect(';')
        expect('}')
        return result
    if token == '(':
        result = []
        while tokens[position] != ')':
            result.append(value())
            if tokens[position] == ',': pop()
            else: break
        expect(')')
        return result
    return json.loads(token) if token.startswith('"') else token

project = value()
assert position == len(tokens)
objects = project['objects']
assert project['rootObject'] in objects
for obj in objects.values():
    def check_refs(v):
        if isinstance(v, dict):
            for k, x in v.items(): check_refs(k); check_refs(x)
        elif isinstance(v, list):
            for x in v: check_refs(x)
        elif isinstance(v, str) and re.fullmatch('[A-F0-9]{24}', v):
            assert v in objects, ('Missing reference', v)
    check_refs(obj)

swift_files = list((root / 'Fotoswipe').glob('*.swift')) + list((root / 'FotoswipeTests').glob('*.swift'))
for file in swift_files:
    assert any(o.get('isa') == 'PBXFileReference' and o.get('path') == file.name for o in objects.values()), file
    assert file.stat().st_size > 0
for resource in ['Assets.xcassets', 'PrivacyInfo.xcprivacy']:
    refs = {k for k, o in objects.items() if o.get('path') == resource}
    assert any(o.get('fileRef') in refs for o in objects.values())
info = plistlib.loads((root / 'Fotoswipe/Info.plist').read_bytes())
assert info['NSPhotoLibraryUsageDescription']
assert info['CFBundleVersion'] == '$(CURRENT_PROJECT_VERSION)'
assert info['CFBundleShortVersionString'] == '$(MARKETING_VERSION)'
privacy = plistlib.loads((root / 'Fotoswipe/PrivacyInfo.xcprivacy').read_bytes())
assert privacy['NSPrivacyTracking'] is False
assert privacy['NSPrivacyCollectedDataTypes'] == []
icon = root / 'Fotoswipe/Assets.xcassets/AppIcon.appiconset/AppIcon.png'
png = icon.read_bytes()
assert png[:8] == b'\x89PNG\r\n\x1a\n'
assert struct.unpack('>II', png[16:24]) == (1024, 1024)
assert png[25] == 2, 'App icon must be opaque RGB'
scheme = ET.parse(root / 'Fotoswipe.xcodeproj/xcshareddata/xcschemes/Fotoswipe.xcscheme')
for ref in scheme.findall('.//BuildableReference'):
    assert ref.attrib['BlueprintIdentifier'] in objects
assert scheme.findall('.//TestableReference')
for file in root.rglob('*.json'): json.loads(file.read_text())
code = '\n'.join(file.read_text() for file in swift_files)
assert 'PHAssetChangeRequest.deleteAssets' in code
assert 'PHPhotoLibrary.requestAuthorization(for: .readWrite)' in code
assert 'URLSession' not in code
assert 'value(forKey:' not in code
print(f'PASS: parsed Xcode project ({len(objects)} objects); all references resolve.')
print(f'PASS: {len(swift_files)} Swift source/test files included, resources, scheme, plist and icon valid.')
print('NOT RUN: Swift compilation, XCTest, simulator/device run, signing or TestFlight upload (requires macOS/Xcode).')
