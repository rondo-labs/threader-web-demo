#!/bin/sh
# Run on the Mac. Copies to the server what it cannot make itself:
#   web/dist          → ~/threader-web-demo/web/dist   (built here; the server has no npm and GitHub is slow from there)
#   media/            → ~/videos/                       (published match videos, same folders as the lake)
#   the 2026 lake     → ~/data/opta/                    (index + 中超/中甲/中乙 2026 events, raw feeds, squads; about 720 MB)
# Then rebuild the site data on the server: ssh tencent-dev '~/threader-web-demo/deploy/build-data.sh'
# Usage: deploy/push-from-mac.sh [--videos-only] [--data-only] [ssh host, default tencent-dev]
#   --videos-only   only the videos       --data-only   only the lake
#   Both flags together push videos and lake but not the web build. A stalled or broken upload retries and resumes.
set -e
web=1 videos=1 data=1 only=0 host=tencent-dev
for arg in "$@"; do
  case "$arg" in
    --videos-only) [ $only = 0 ] && web=0 videos=0 data=0; only=1; videos=1 ;;
    --data-only) [ $only = 0 ] && web=0 videos=0 data=0; only=1; data=1 ;;
    -*) echo "不认识的选项：${arg}（可用 --videos-only、--data-only）" >&2; exit 1 ;;
    *) host="$arg" ;;
  esac
done
repo="$(cd "$(dirname "$0")/.." && pwd)"
# A connection that goes quiet is dropped after about a minute instead of hanging, and the upload picks up
# where it stopped (--partial keeps what arrived). Up to 10 attempts.
ssh_opts="ssh -o ServerAliveInterval=15 -o ServerAliveCountMax=4"
push() {
  n=1
  until rsync -a --partial --timeout=60 -e "$ssh_opts" "$@"; do
    [ $n -ge 10 ] && { echo "试了 $n 次都没传完，稍后再跑一次会接着传" >&2; return 1; }
    echo "连接断了，10 秒后接着传（第 $n 次重试）" >&2
    n=$((n + 1))
    sleep 10
  done
}
lake="${OPTA_LAKE_ROOT:-$repo/../opta-scraper/data/opta}"
ssh "$host" 'test -d ~/threader-web-demo/web' || { echo "服务器上还没有 ~/threader-web-demo，先 git clone" >&2; exit 1; }

if [ $web = 1 ]; then
  echo "== web/dist"
  (cd "$repo/web" && pnpm -s build)
  push --delete "$repo/web/dist/" "$host:threader-web-demo/web/dist/"
fi

if [ $videos = 1 ]; then
  echo "== videos"
  push --progress --include='*/' --include='*.mp4' --exclude='*' "$repo/media/" "$host:videos/"
fi

if [ $data = 1 ]; then
  echo "== lake (2026 中超/中甲/中乙)"
  cd "$lake"
  paths="index.parquet"
  for c in chinese-super-league-2026 chinese-football-league-1-2026 chinese-football-league-2-2026; do
    for d in events raw squads; do [ -e "$d/$c" ] && paths="$paths $d/$c"; done
  done
  # shellcheck disable=SC2086
  push --relative $paths "$host:data/opta/"
fi

if [ $videos = 1 ] || [ $data = 1 ]; then
  echo "完成。接着在服务器上：~/threader-web-demo/deploy/build-data.sh"
else
  echo "完成。"
fi
