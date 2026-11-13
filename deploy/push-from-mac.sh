#!/bin/sh
# Run on the Mac. Copies to the server what it cannot make itself:
#   web/dist          → ~/threader-web-demo/web/dist   (built here; the server has no npm and GitHub is slow from there)
#   media/            → ~/videos/                       (published match videos, same folders as the lake)
#   the 2026 lake     → ~/data/opta/                    (index + 中超/中甲/中乙 2026 events, raw feeds, squads; about 720 MB)
# Then rebuild the site data on the server: ssh tencent-dev '~/threader-web-demo/deploy/build-data.sh'
# Usage: deploy/push-from-mac.sh [ssh host, default tencent-dev]
set -e
host="${1:-tencent-dev}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
lake="${OPTA_LAKE_ROOT:-$repo/../opta-scraper/data/opta}"
ssh "$host" 'test -d ~/threader-web-demo/web' || { echo "服务器上还没有 ~/threader-web-demo，先 git clone" >&2; exit 1; }

echo "== web/dist"
(cd "$repo/web" && pnpm -s build)
rsync -a --delete "$repo/web/dist/" "$host:threader-web-demo/web/dist/"

echo "== videos"
rsync -a --progress --include='*/' --include='*.mp4' --exclude='*' "$repo/media/" "$host:videos/"

echo "== lake (2026 中超/中甲/中乙)"
cd "$lake"
paths="index.parquet"
for c in chinese-super-league-2026 chinese-football-league-1-2026 chinese-football-league-2-2026; do
  for d in events raw squads; do [ -e "$d/$c" ] && paths="$paths $d/$c"; done
done
# shellcheck disable=SC2086
rsync -a --relative $paths "$host:data/opta/"
echo "完成。接着在服务器上：~/threader-web-demo/deploy/build-data.sh"
