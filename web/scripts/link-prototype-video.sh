#!/bin/sh
# PROTOTYPE: link the local 2026-09-19 match video into public/ so Vite serves it with Range requests.
# Override the folder with FEILU_VIDEO_DIR if the videos live elsewhere.
set -e
here="$(cd "$(dirname "$0")/.." && pwd)"
src_dir="${FEILU_VIDEO_DIR:-$HOME/Dev/threader-test/飞鹭demo}"
src="$src_dir/厦门飞鹭 VS 北京理工.mp4"
if [ ! -f "$src" ]; then
  echo "找不到视频：$src（用 FEILU_VIDEO_DIR 指定目录）" >&2
  exit 1
fi
mkdir -p "$here/public/media/prototype"
ln -sf "$src" "$here/public/media/prototype/20260919-xiamen-bit.mp4"
