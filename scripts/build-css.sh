#!/usr/bin/env bash
# Build the Tailwind v4 CSS bundle into src/assets/style.css (committed).
#
# DevWP ships a prebuilt CSS file embedded in the binary, so no Node toolchain
# is needed at build time. Re-run this script (and commit the result) after
# changing any class names in src/.
#
# Requires the standalone Tailwind v4 CLI binary; a pinned version is
# downloaded into the cache on first use.
set -euo pipefail

VERSION=v4.3.0
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}"
BIN="$CACHE_DIR/tailwindcss-${VERSION}"

if [[ ! -x "$BIN" ]]; then
  uname_s="$(uname -s)"
  uname_m="$(uname -m)"
  case "$uname_s/$uname_m" in
    Linux/x86_64) target=linux-x64 ;;
    Linux/aarch64) target=linux-arm64 ;;
    Darwin/arm64) target=macos-arm64 ;;
    Darwin/x86_64) target=macos-x64 ;;
    *)
      echo "Unsupported platform: $uname_s/$uname_m" >&2
      exit 1
      ;;
  esac
  curl -fL -o "$BIN" \
    "https://github.com/tailwindlabs/tailwindcss/releases/download/${VERSION}/tailwindcss-${target}"
  chmod +x "$BIN"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

exec "$BIN" -i "$ROOT/src/assets/tailwind.css" -o "$ROOT/src/assets/style.css" --minify
