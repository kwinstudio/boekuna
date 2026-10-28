#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v xcodebuild >/dev/null; then
  echo 'Voor deze tests is een Mac met Xcode en een iOS-simulator nodig.' >&2
  exit 1
fi
simulator_id="$(xcrun simctl list devices available --json | python3 -c 'import json,sys; d=json.load(sys.stdin); ids=[v["udid"] for k,vs in d["devices"].items() if "iOS" in k for v in vs if "iPhone" in v["name"]]; print(ids[0] if ids else "")')"
if [ -z "$simulator_id" ]; then
  echo 'Installeer eerst een iPhone-simulator via Xcode > Settings > Components.' >&2
  exit 1
fi
xcodebuild -project Fotoswipe.xcodeproj -scheme Fotoswipe \
  -destination "platform=iOS Simulator,id=$simulator_id" \
  -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO test
