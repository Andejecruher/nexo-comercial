#!/usr/bin/env bash
set -euo pipefail

audio_file=${1:?"Usage: $0 <audio.ogg> [public-url]"}
public_url=${2:-}

test -f "$audio_file"

probe=$(ffprobe -v error -select_streams a:0 \
  -show_entries stream=codec_name,channels -show_entries format=format_name \
  -of default=noprint_wrappers=1 "$audio_file")

grep -qx 'codec_name=opus' <<<"$probe"
grep -qx 'channels=1' <<<"$probe"
grep -q '^format_name=.*ogg' <<<"$probe"
echo "OK: $audio_file is mono OGG Opus"

if [[ -n "$public_url" ]]; then
  headers=$(curl --fail --silent --show-error --head --location "$public_url")
  grep -qi '^content-type:[[:space:]]*audio/ogg\b' <<<"$headers"
  echo "OK: $public_url responds with Content-Type: audio/ogg"
fi
