#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
simulator_id="$(xcrun simctl list devices available --json | python3 -c 'import json,sys; d=json.load(sys.stdin); ids=[v["udid"] for vs in d["devices"].values() for v in vs if "iPhone" in v["name"]]; print(ids[0] if ids else "")')"
[[ -n "$simulator_id" ]] || { echo 'No available iPhone simulator for smoke capture'; exit 1; }
xcrun simctl boot "$simulator_id" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$simulator_id" -b
app='build/DerivedData/Build/Products/Debug-iphonesimulator/Fotoswipe.app'
[[ -d "$app" ]] || { echo 'Simulator application missing'; exit 1; }
xcrun simctl terminate "$simulator_id" nl.zichtwerfstudio.fotoswipe >/dev/null 2>&1 || true
xcrun simctl install "$simulator_id" "$app"
xcrun simctl privacy "$simulator_id" grant photos nl.zichtwerfstudio.fotoswipe
# Synthetic fixture only; no personal images in CI.
xcrun simctl addmedia "$simulator_id" Fotoswipe/Assets.xcassets/AppIcon.appiconset/AppIcon.png
xcrun simctl launch "$simulator_id" nl.zichtwerfstudio.fotoswipe
sleep 5
mkdir -p build/smoke
xcrun simctl io "$simulator_id" screenshot build/smoke/fotoswipe-iphone.png
