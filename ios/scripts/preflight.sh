#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: Xcode preflight requires macOS. Run python3 ios/scripts/validate.py for packaging checks only." >&2
  exit 2
fi
python3 "$REPO_ROOT/ios/scripts/validate.py"
xcodebuild -version
XCODE_MAJOR="$(xcodebuild -version | awk '/^Xcode / {split($2,v,".");print v[1]}')"
SDK_MAJOR="$(xcrun --sdk iphoneos --show-sdk-version | cut -d. -f1)"
if [[ "$XCODE_MAJOR" -lt 26 || "$SDK_MAJOR" -lt 26 ]]; then
  echo "ERROR: App Store Connect currently requires Xcode 26+ and iOS SDK 26+." >&2
  exit 2
fi
TEST_BINARY="$(mktemp -t boekuna-navigation)"
trap 'rm -f "$TEST_BINARY"' EXIT
xcrun swiftc "$REPO_ROOT/ios/Boekuna/NavigationPolicy.swift" "$REPO_ROOT/ios/Tests/NavigationPolicyTests.swift" -o "$TEST_BINARY"
"$TEST_BINARY"
for CONFIGURATION in Debug Release; do
  xcodebuild -project "$REPO_ROOT/ios/Boekuna.xcodeproj" -scheme Boekuna \
    -configuration "$CONFIGURATION" -sdk iphonesimulator \
    -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$REPO_ROOT/ios/DerivedData" CODE_SIGNING_ALLOWED=NO build
done
# A simulator build does not prove device-SDK compilation or signing.
xcodebuild -project "$REPO_ROOT/ios/Boekuna.xcodeproj" -scheme Boekuna \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath "$REPO_ROOT/ios/DerivedData" CODE_SIGNING_ALLOWED=NO build
