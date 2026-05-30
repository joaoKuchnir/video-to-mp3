# Download yt-dlp + ffmpeg + deno sidecars for Windows x64 and name them with the
# Rust target-triple suffix Tauri's `externalBin` expects.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/fetch-sidecars.ps1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $root "src-tauri/binaries"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

$triple = "x86_64-pc-windows-msvc"
$tmp = Join-Path $env:TEMP ("sidecars-" + [System.Guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

try {
  Write-Host "Fetching yt-dlp..."
  Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" `
    -OutFile (Join-Path $binDir "yt-dlp-$triple.exe")

  Write-Host "Fetching deno..."
  $denoZip = Join-Path $tmp "deno.zip"
  $denoDir = Join-Path $tmp "deno"
  New-Item -ItemType Directory -Force -Path $denoDir | Out-Null
  Invoke-WebRequest -Uri "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip" -OutFile $denoZip
  # tar (bsdtar built into Win10+) extracts zips 3-5x faster than Expand-Archive
  tar -xf $denoZip -C $denoDir
  Copy-Item (Join-Path $denoDir "deno.exe") (Join-Path $binDir "deno-$triple.exe") -Force

  Write-Host "Fetching ffmpeg..."
  $ffZip = Join-Path $tmp "ffmpeg.zip"
  $ffDir = Join-Path $tmp "ffmpeg"
  New-Item -ItemType Directory -Force -Path $ffDir | Out-Null
  Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile $ffZip
  tar -xf $ffZip -C $ffDir
  $ff = Get-ChildItem -Path (Join-Path $tmp "ffmpeg") -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
  $fp = Get-ChildItem -Path (Join-Path $tmp "ffmpeg") -Recurse -Filter "ffprobe.exe" | Select-Object -First 1
  Copy-Item $ff.FullName (Join-Path $binDir "ffmpeg-$triple.exe") -Force
  if ($fp) { Copy-Item $fp.FullName (Join-Path $binDir "ffprobe-$triple.exe") -Force }

  Write-Host "Done. Sidecars in ${binDir}:"
  Get-ChildItem $binDir
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
