#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_LOGO="$ROOT_DIR/packages/ui/assets/logo.png"
TMP_DIR="$(mktemp -d)"
MASTER_LOGO="$TMP_DIR/logo-master.png"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ ! -f "$SOURCE_LOGO" ]]; then
  echo "Missing source logo at $SOURCE_LOGO"
  exit 1
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick ('magick') is required to sync brand assets."
  exit 1
fi

render_square() {
  local source="$1"
  local output="$2"
  local canvas="$3"
  local fit="$4"

  magick "$source" \
    -filter Lanczos \
    -resize "${fit}x${fit}" \
    -background none \
    -gravity center \
    -extent "${canvas}x${canvas}" \
    -unsharp 0x0.75+0.6+0.01 \
    -strip \
    "$output"
}

render_splash() {
  local source="$1"
  local output="$2"
  local canvas="$3"
  local fit="$4"

  # Keep splash centered on a square transparent canvas so native
  # generation cannot inherit any asymmetric bounds from the source.
  magick "$source" \
    -filter Lanczos \
    -resize "${fit}x${fit}" \
    -background none \
    -gravity center \
    -extent "${canvas}x${canvas}" \
    -unsharp 0x0.75+0.6+0.01 \
    -strip \
    "$output"
}

mkdir -p "$ROOT_DIR/apps/mobile/assets" "$ROOT_DIR/apps/web/public"

# Build a trimmed high-resolution master logo once, then derive all assets
# from the same source for consistent centering.
magick "$SOURCE_LOGO" \
  -trim +repage \
  -filter Lanczos \
  -resize 2200x2200\> \
  -strip \
  "$MASTER_LOGO"

# Mobile assets
render_square "$MASTER_LOGO" "$ROOT_DIR/apps/mobile/assets/icon.png" 1024 840
# Avoid upscaling the base logo for splash to keep edges sharp.
render_splash "$MASTER_LOGO" "$ROOT_DIR/apps/mobile/assets/splash-icon.png" 2048 900
# Keep the adaptive icon in Android's safe zone so launchers don't clip it.
render_square "$MASTER_LOGO" "$ROOT_DIR/apps/mobile/assets/adaptive-icon.png" 1024 620
render_square "$MASTER_LOGO" "$ROOT_DIR/apps/mobile/assets/favicon.png" 48 38

# Web assets
render_square "$MASTER_LOGO" "$ROOT_DIR/apps/web/public/favicon.png" 192 154
render_square "$MASTER_LOGO" "$ROOT_DIR/apps/web/public/favicon-32.png" 32 26
render_square "$MASTER_LOGO" "$ROOT_DIR/apps/web/public/apple-touch-icon.png" 180 144

echo "Brand assets synced from: $SOURCE_LOGO"
