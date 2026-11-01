#!/bin/bash
# Launches each demo screen on an iPhone simulator and saves a screenshot (no network, sample data).
set -euo pipefail
cd "$(dirname "$0")/.."
SIM="${SIM:-$(xcrun simctl list devices available --json | python3 -c 'import json,sys; d=json.load(sys.stdin); c=[v for k,vs in d["devices"].items() if "iOS" in k for v in vs if v["name"].startswith("iPhone") and "Pro Max" in v["name"]] or [v for k,vs in d["devices"].items() if "iOS" in k for v in vs if v["name"].startswith("iPhone")]; print(c[-1]["udid"])')}"
APP=build/DerivedData/Build/Products/Debug-iphonesimulator/Lootjes.app
[[ -d "$APP" ]] || { echo "App not built"; exit 1; }
[[ -f "$APP/PrivacyInfo.xcprivacy" ]] && echo "::notice title=Privacy::Privacy manifest is in the app." || echo "::warning title=Privacy::PrivacyInfo.xcprivacy missing from the app bundle."
xcrun simctl boot "$SIM" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$SIM" -b
xcrun simctl status_bar "$SIM" override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 || true
xcrun simctl install "$SIM" "$APP"
mkdir -p build/screens
for screen in ${SCREENS:-home create before organizer scratch member poem pass drawing kerst wishlist shops}; do
  for mode in light dark; do
    xcrun simctl ui "$SIM" appearance "$mode"
    xcrun simctl terminate "$SIM" nl.zichtwerfstudio.lootjes >/dev/null 2>&1 || true
    xcrun simctl launch "$SIM" nl.zichtwerfstudio.lootjes -demoScreen "$screen" >/dev/null
    sleep 4
    xcrun simctl io "$SIM" screenshot "build/screens/$screen-$mode.png" >/dev/null
    echo "captured $screen ($mode)"
    [[ "$mode" == light ]] || true
  done
done
# Envelope animation frames.
xcrun simctl ui "$SIM" appearance light
xcrun simctl terminate "$SIM" nl.zichtwerfstudio.lootjes >/dev/null 2>&1 || true
xcrun simctl launch "$SIM" nl.zichtwerfstudio.lootjes -demoScreen opening >/dev/null
sleep 2.2
for i in 1 2 3 4 5 6; do xcrun simctl io "$SIM" screenshot "build/screens/opening-$i.png" >/dev/null; sleep 0.1; done
sleep 1.5
xcrun simctl io "$SIM" screenshot build/screens/opening-done.png >/dev/null
# Real first launch (empty state) too.
xcrun simctl ui "$SIM" appearance light
xcrun simctl terminate "$SIM" nl.zichtwerfstudio.lootjes >/dev/null 2>&1 || true
xcrun simctl launch "$SIM" nl.zichtwerfstudio.lootjes >/dev/null
sleep 4
xcrun simctl io "$SIM" screenshot build/screens/first-launch.png >/dev/null
# iPad (App Store needs 13" iPad screenshots because the app runs on iPad).
IPAD="$(xcrun simctl list devices available --json | python3 -c 'import json,sys; d=json.load(sys.stdin); c=[v for k,vs in d["devices"].items() if "iOS" in k for v in vs if v["name"].startswith("iPad Pro") and "13" in v["name"]] or [v for k,vs in d["devices"].items() if "iOS" in k for v in vs if v["name"].startswith("iPad Pro")]; print(c[-1]["udid"] if c else "")')"
if [[ -n "$IPAD" ]]; then
  xcrun simctl shutdown "$SIM" >/dev/null 2>&1 || true
  xcrun simctl boot "$IPAD" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$IPAD" -b
  xcrun simctl status_bar "$IPAD" override --time 9:41 --batteryState charged --batteryLevel 100 || true
  xcrun simctl install "$IPAD" "$APP"
  xcrun simctl ui "$IPAD" appearance light
  for screen in ${IPAD_SCREENS:-home create scratch organizer member wishlist shops poem}; do
    xcrun simctl terminate "$IPAD" nl.zichtwerfstudio.lootjes >/dev/null 2>&1 || true
    xcrun simctl launch "$IPAD" nl.zichtwerfstudio.lootjes -demoScreen "$screen" >/dev/null
    sleep 4
    xcrun simctl io "$IPAD" screenshot "build/screens/ipad-$screen.png" >/dev/null
    echo "captured iPad $screen"
  done
  xcrun simctl terminate "$IPAD" nl.zichtwerfstudio.lootjes >/dev/null 2>&1 || true
  xcrun simctl launch "$IPAD" nl.zichtwerfstudio.lootjes -demoScreen opening >/dev/null
  sleep 4
  xcrun simctl io "$IPAD" screenshot build/screens/ipad-opening-done.png >/dev/null
else
  echo "No iPad simulator found; skipping iPad screenshots."
fi
