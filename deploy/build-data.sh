#!/bin/sh
# Run on the server after deploy/push-from-mac.sh: rebuild the match data from ~/data/opta and ~/videos, then publish
# the site into the folder nginx serves. threader.matchmate.chat is a plain static site, open to anyone and kept out
# of search engines (robots.txt here, a noindex meta in the page); nothing on the server needs sudo.
#   /                     web/dist (built on the Mac)
#   /match/<id>/          a copy of the page per match, so a match link opens without any nginx rewrite
#   /data/                site-data/ (index.json, matches/<id>.json)
#   /media/<league>/...   the videos, hard-linked from ~/videos (same disk, no extra space)
# The raw lake in ~/data stays out of the published folder.
# Env: THREADER_PUBLIC (default the server folder), THREADER_MEDIA_DIR (default ~/videos),
#      THREADER_PYTHON (default a virtualenv filled from the Tencent PyPI mirror; pypi.org is slow from the server).
set -e
repo="$(cd "$(dirname "$0")/.." && pwd)"
pub="${THREADER_PUBLIC:-/var/www/threader.matchmate.chat/public}"
videos="${THREADER_MEDIA_DIR:-$HOME/videos}"
python="${THREADER_PYTHON:-}"
[ -f "$repo/web/dist/index.html" ] || { echo "没有 web/dist：先在 Mac 上运行 deploy/push-from-mac.sh" >&2; exit 1; }
[ -w "$pub" ] || { echo "写不了 $pub" >&2; exit 1; }

echo "== 生成比赛数据"
if [ -z "$python" ]; then
  venv="$repo/pipeline/.venv-server"
  if [ ! -x "$venv/bin/python" ]; then
    python3 -m venv "$venv"
    "$venv/bin/pip" install -q -i "${PIP_INDEX_URL:-https://mirrors.cloud.tencent.com/pypi/simple}" "pyarrow>=17" "pypinyin>=0.55.0"
  fi
  python="$venv/bin/python"
fi
(cd "$repo/pipeline" && PYTHONPATH=. THREADER_MEDIA_DIR="$videos" "$python" -m threader_demo.site)

echo "== 发布到 $pub"
stage="$repo/.publish"
rm -rf "$stage"
cp -R "$repo/web/dist" "$stage"
cp -R "$repo/site-data" "$stage/data"
for f in "$stage"/data/matches/*.json; do
  id="$(basename "$f" .json)"
  mkdir -p "$stage/match/$id"
  cp "$stage/index.html" "$stage/match/$id/index.html"
done
printf 'User-agent: *\nDisallow: /\n' >"$stage/robots.txt"
chmod -R a+rX "$stage"
rsync -a --delete --exclude=/media/ "$stage/" "$pub/"
rm -rf "$stage"
mkdir -p "$pub/media" "$videos"
rsync -a --delete --prune-empty-dirs --link-dest="$videos/" --include='*/' --include='*.mp4' --exclude='*' "$videos/" "$pub/media/"
chmod -R a+rX "$pub/media"

if [ -z "$THREADER_PUBLIC" ]; then
  echo "== 检查 https://threader.matchmate.chat"
  site=https://threader.matchmate.chat
  first="$(ls "$repo"/site-data/matches | head -1 | sed 's/\.json$//')"
  code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
  row() { if [ "$2" = "$3" ]; then echo "  ✓ $1"; else echo "  ✗ $1：得到 $2，应为 $3"; fi; }
  row "首页"            "$(code "$site/")" 200
  row "比赛列表数据"     "$(code "$site/data/index.json")" 200
  row "单场比赛链接"     "$(code "$site/match/$first/?team=x")" 200
  row "robots.txt 禁止收录" "$(curl -s "$site/robots.txt" | tail -1)" "Disallow: /"
  v="$(cd "$pub/media" && find . -name '*.mp4' | head -1 | sed 's|^\./||')"
  [ -n "$v" ] && row "视频可以跳着播" "$(code -r 0-99 "$site/media/$v")" 206
fi
echo "完成。"
