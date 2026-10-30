#!/bin/bash
# Launches each demo screen on an iPhone simulator and saves a screenshot (no network, sample data).
set -euo pipefail
cd "$(dirname "$0")/.."
SIM="${SIM:-$(xcrun simctl list devices available --json | python3 -c 'import json,sys; d=json.load(sys.stdin); c=[v for k,vs in d["devices"].items() if "iOS" in k for v in vs if v["name"].startswith("iPhone") and "Pro Max" in v["name"]] or [v for k,vs in d["devices"].items() if "iOS" in k for v in vs if v["name"].startswith("iPhone")]; print(c[-1]["udid"])')}"
APP=build/DerivedData/Build/Products/Debug-iphonesimulator/Lootjes.app
[[ -d "$APP" ]] || { echo "App not built"; exit 1; }
xcrun simctl boot "$SIM" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$SIM" -b
xcrun simctl status_bar "$SIM" override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 || true
xcrun simctl install "$SIM" "$APP"
mkdir -p build/screens
for screen in ${SCREENS:-home create before organizer scratch member poem pass}; do
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
# Real first launch (empty state) too.
xcrun simctl ui "$SIM" appearance light
xcrun simctl terminate "$SIM" nl.zichtwerfstudio.lootjes >/dev/null 2>&1 || true
xcrun simctl launch "$SIM" nl.zichtwerfstudio.lootjes >/dev/null
sleep 4
xcrun simctl io "$SIM" screenshot build/screens/first-launch.png >/dev/null
