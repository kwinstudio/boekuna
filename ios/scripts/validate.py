#!/usr/bin/env python3
"""Cross-platform packaging checks. This is not an Xcode or physical-device test."""
import json
import plistlib
import struct
from pathlib import Path

root = Path(__file__).resolve().parents[2]
for name in ['Boekuna/Info.plist', 'ExportOptions-IPA.plist', 'ExportOptions-TestFlight.plist']:
    with (root / 'ios' / name).open('rb') as stream:
        data = plistlib.load(stream)
    if name == 'Boekuna/Info.plist':
        assert data['NSCameraUsageDescription'] and data['NSPhotoLibraryUsageDescription']
        assert data['CFBundleIdentifier'] == '$(PRODUCT_BUNDLE_IDENTIFIER)'
    else:
        assert data['method'] == 'app-store-connect'
        assert data['manageAppVersionAndBuildNumber'] is False
for file in (root / 'ios/Boekuna/Assets.xcassets').rglob('Contents.json'):
    json.loads(file.read_text())
icon = root / 'ios/Boekuna/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png'
canonical = root / 'public/assets/boekuna-app-icon-1024.png'
assert icon.read_bytes() == canonical.read_bytes(), 'Synchronize the native icon with the canonical production asset'
header = icon.read_bytes()[:33]
assert header[:8] == b'\x89PNG\r\n\x1a\n'
width, height, depth, color = struct.unpack('>IIBB', header[16:26])
assert (width, height, depth, color) == (1024, 1024, 8, 2), 'App Store icon must be a 1024px opaque RGB PNG'
project = (root / 'ios/Boekuna.xcodeproj/project.pbxproj').read_text()
assert project.count('PRODUCT_BUNDLE_IDENTIFIER = nl.boekuna.app;') == 2
assert project.count('DEVELOPMENT_TEAM = "";') == 2, 'Do not commit account-specific signing settings'
for file in (root / 'ios/Boekuna').glob('*.swift'):
    assert file.name + ' in Sources' in project, f'{file.name} must be in the Xcode target'
print('PASS iOS packaging: plists, asset JSON, source membership, Bundle ID and opaque canonical icon')
