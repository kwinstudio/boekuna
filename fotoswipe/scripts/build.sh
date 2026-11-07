#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v xcodebuild >/dev/null; then
  echo 'Voor deze controle is een Mac met Xcode nodig.' >&2
  exit 1
fi
xcodebuild -project Fotoswipe.xcodeproj -scheme Fotoswipe \
  -destination 'generic/platform=iOS Simulator' -configuration Debug \
  -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO build
