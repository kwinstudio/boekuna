#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT="$REPO_ROOT/ios/Boekuna.xcodeproj"
ARCHIVE_PATH="${ARCHIVE_PATH:-$REPO_ROOT/ios/build/Boekuna.xcarchive}"
EXPORT_PATH="${EXPORT_PATH:-$REPO_ROOT/ios/build/export}"
TEAM_ID="${DEVELOPMENT_TEAM:-}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: iOS archives must be created on macOS with Xcode." >&2
  exit 2
fi

if [[ -z "$TEAM_ID" ]]; then
  echo "ERROR: set DEVELOPMENT_TEAM to the Apple Developer Team ID before archiving." >&2
  exit 2
fi

if [[ ! "$TEAM_ID" =~ ^[A-Z0-9]{10}$ ]]; then
  echo "ERROR: DEVELOPMENT_TEAM must be the 10-character Apple Team ID." >&2
  exit 2
fi
BUILD_NUMBER="${BUILD_NUMBER:-}"
if [[ ! "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]]; then
  echo "ERROR: set BUILD_NUMBER to an unused positive build number from App Store Connect." >&2
  exit 2
fi
if [[ "${UPLOAD_TO_TESTFLIGHT:-0}" != "0" && "${UPLOAD_TO_TESTFLIGHT:-0}" != "1" ]]; then
  echo "ERROR: UPLOAD_TO_TESTFLIGHT must be 0 or 1." >&2
  exit 2
fi
# Verify the exact checkout before signing; no secrets are read by preflight.
if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
  echo "ERROR: commit or remove non-ignored changes before signing so the build identity is reproducible." >&2
  exit 2
fi
"$REPO_ROOT/ios/scripts/preflight.sh"
mkdir -p "$(dirname "$ARCHIVE_PATH")" "$EXPORT_PATH"

xcodebuild \
  -project "$PROJECT" \
  -scheme Boekuna \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates \
  archive

# Persist build identity beside the archive, never account credentials.
COMMIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
printf 'commit=%s\nbuild=%s\nbundle=nl.boekuna.app\n' "$COMMIT_SHA" "$BUILD_NUMBER" > "$EXPORT_PATH/build-identity.txt"

if [[ "${UPLOAD_TO_TESTFLIGHT:-0}" == "1" ]]; then
  xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportOptionsPlist "$REPO_ROOT/ios/ExportOptions-TestFlight.plist" \
    -exportPath "$EXPORT_PATH" \
    -allowProvisioningUpdates
else
  xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportOptionsPlist "$REPO_ROOT/ios/ExportOptions-IPA.plist" \
    -exportPath "$EXPORT_PATH" \
    -allowProvisioningUpdates
fi
