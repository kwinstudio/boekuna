#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT="$ROOT/ios/Boekuna.xcodeproj"
ARCHIVE_PATH="${ARCHIVE_PATH:-$ROOT/build/Boekuna.xcarchive}"
EXPORT_PATH="${EXPORT_PATH:-$ROOT/build/export}"
TEAM_ID="${DEVELOPMENT_TEAM:-}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: iOS archives must be created on macOS with Xcode." >&2
  exit 2
fi

if [[ -z "$TEAM_ID" ]]; then
  echo "ERROR: set DEVELOPMENT_TEAM to the Apple Developer Team ID before archiving." >&2
  exit 2
fi

xcodebuild -version
mkdir -p "$(dirname "$ARCHIVE_PATH")" "$EXPORT_PATH"

xcodebuild \
  -project "$PROJECT" \
  -scheme Boekuna \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates \
  archive

if [[ "${UPLOAD_TO_TESTFLIGHT:-0}" == "1" ]]; then
  xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportOptionsPlist "$ROOT/ios/ExportOptions-TestFlight.plist" \
    -exportPath "$EXPORT_PATH" \
    -allowProvisioningUpdates
else
  xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportOptionsPlist "$ROOT/ios/ExportOptions-IPA.plist" \
    -exportPath "$EXPORT_PATH" \
    -allowProvisioningUpdates
fi
