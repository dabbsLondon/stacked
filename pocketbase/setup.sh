#!/bin/sh
# Stacked — PocketBase installer.
# Downloads the right PocketBase binary for the host machine into the
# pocketbase/ directory, alongside the JS migrations in pb_migrations/.
# Idempotent: if the binary is already present this script is a no-op.

set -eu

VERSION="0.22.21"
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if [ -x ./pocketbase ]; then
  echo "pocketbase already installed at $DIR/pocketbase"
  ./pocketbase --version || true
  exit 0
fi

uname_s="$(uname -s)"
uname_m="$(uname -m)"

case "${uname_s}-${uname_m}" in
  Darwin-arm64)        PLATFORM="darwin_arm64" ;;
  Darwin-x86_64)       PLATFORM="darwin_amd64" ;;
  Linux-x86_64)        PLATFORM="linux_amd64" ;;
  Linux-aarch64|Linux-arm64) PLATFORM="linux_arm64" ;;
  *)
    echo "Unsupported platform: ${uname_s}-${uname_m}" >&2
    echo "Manually download a build from https://github.com/pocketbase/pocketbase/releases" >&2
    exit 1
    ;;
esac

ARCHIVE="pocketbase_${VERSION}_${PLATFORM}.zip"
URL="https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/${ARCHIVE}"

echo "Downloading $URL"
curl -fL --progress-bar -o "$ARCHIVE" "$URL"
unzip -o "$ARCHIVE" >/dev/null
rm -f "$ARCHIVE" CHANGELOG.md LICENSE.md
chmod +x ./pocketbase

echo
echo "pocketbase installed at $DIR/pocketbase"
echo
echo "Next:"
echo "  npm run pb:start                 # serves on http://127.0.0.1:8090"
echo "  open http://127.0.0.1:8090/_/    # admin UI (create your admin on first visit)"
