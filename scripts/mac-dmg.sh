#!/bin/bash
# macOS only (CI): ad-hoc sign the universal Dumbo.app and wrap it in a drag-to-Applications .dmg.
# Ad-hoc signing is free (no Apple Developer account). Apple Silicon Macs refuse to run apps with no
# signature at all; with an ad-hoc one, macOS asks once and the user clicks "Open Anyway".
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
APP=$(ls -d release/installer/mac*/Dumbo.app | head -1)
STAGE=release/dmg
OUT="release/Dumbo-$VERSION-mac.dmg"

xattr -cr "$APP"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
lipo -archs "$APP/Contents/MacOS/Dumbo"

rm -rf "$STAGE" && mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
cp "mac/How to open Dumbo.txt" "$STAGE/"
hdiutil create -volname "Dumbo" -srcfolder "$STAGE" -ov -format UDZO "$OUT"
ls -lh "$OUT"
