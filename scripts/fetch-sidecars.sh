#!/usr/bin/env bash
# Download yt-dlp + ffmpeg + deno sidecars for the CURRENT platform/arch and
# name them with the Rust target-triple suffix that Tauri's `externalBin` expects.
#
# Usage: scripts/fetch-sidecars.sh
# Runs on macOS and Linux. For Windows use fetch-sidecars.ps1.
set -euo pipefail

cd "$(dirname "$0")/.."
BIN_DIR="src-tauri/binaries"
mkdir -p "$BIN_DIR"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS-$ARCH" in
  Darwin-arm64)
    TRIPLE="aarch64-apple-darwin"
    YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
    DENO_URL="https://github.com/denoland/deno/releases/latest/download/deno-aarch64-apple-darwin.zip"
    FFMPEG_URL="https://www.osxexperts.net/ffmpeg711arm.zip"
    EXT="" ;;
  Darwin-x86_64)
    TRIPLE="x86_64-apple-darwin"
    YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
    DENO_URL="https://github.com/denoland/deno/releases/latest/download/deno-x86_64-apple-darwin.zip"
    FFMPEG_URL="https://www.osxexperts.net/ffmpeg711intel.zip"
    EXT="" ;;
  Linux-x86_64)
    TRIPLE="x86_64-unknown-linux-gnu"
    YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux"
    DENO_URL="https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip"
    FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
    EXT="" ;;
  *)
    echo "Unsupported platform: $OS-$ARCH" >&2
    exit 1 ;;
esac

echo "Platform: $OS-$ARCH  triple=$TRIPLE"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- yt-dlp ---
echo "Fetching yt-dlp..."
curl -L -sS -o "$BIN_DIR/yt-dlp-$TRIPLE$EXT" "$YTDLP_URL"
chmod +x "$BIN_DIR/yt-dlp-$TRIPLE$EXT"

# --- deno ---
echo "Fetching deno..."
curl -L -sS -o "$TMP/deno.zip" "$DENO_URL"
unzip -o -q "$TMP/deno.zip" -d "$TMP/deno"
mv "$TMP/deno/deno" "$BIN_DIR/deno-$TRIPLE$EXT"
chmod +x "$BIN_DIR/deno-$TRIPLE$EXT"

# --- ffmpeg ---
echo "Fetching ffmpeg..."
if [ "$OS" = "Darwin" ]; then
  curl -L -sS -o "$TMP/ffmpeg.zip" "$FFMPEG_URL"
  unzip -o -q "$TMP/ffmpeg.zip" -d "$TMP/ffmpeg"
  FF="$(find "$TMP/ffmpeg" -name ffmpeg -type f | head -1)"
  mv "$FF" "$BIN_DIR/ffmpeg-$TRIPLE$EXT"
else
  curl -L -sS -o "$TMP/ffmpeg.tar.xz" "$FFMPEG_URL"
  tar -xf "$TMP/ffmpeg.tar.xz" -C "$TMP"
  FF="$(find "$TMP" -name ffmpeg -type f | head -1)"
  FP="$(find "$TMP" -name ffprobe -type f | head -1)"
  mv "$FF" "$BIN_DIR/ffmpeg-$TRIPLE$EXT"
  [ -n "$FP" ] && cp "$FP" "$BIN_DIR/ffprobe-$TRIPLE$EXT" && chmod +x "$BIN_DIR/ffprobe-$TRIPLE$EXT"
fi
chmod +x "$BIN_DIR/ffmpeg-$TRIPLE$EXT"

# Clear quarantine on macOS so the binaries run unsigned in dev.
if [ "$OS" = "Darwin" ]; then
  xattr -dr com.apple.quarantine "$BIN_DIR" 2>/dev/null || true
fi

echo "Done. Sidecars in $BIN_DIR:"
ls -la "$BIN_DIR"
