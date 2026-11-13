#!/bin/sh
# Serve the built site through the real nginx gate on this Mac: http://localhost:8088
# Needs Docker. Builds web/dist, writes a local invites.map with one test club, and prints its link.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(dirname "$here")"
(cd "$repo/web" && pnpm build)
map="$here/nginx/invites.map"
[ -f "$map" ] || printf '"%s" "本机测试";\n' "$(openssl rand -hex 16)" > "$map"
docker rm -f threader-local >/dev/null 2>&1 || true
docker run -d --name threader-local -p 8088:8080 \
  -v "$here/nginx/local.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$map:/etc/nginx/threader/invites.map:ro" \
  -v "$repo:/home/xingnanzhu/threader-web-demo:ro" \
  -v "$repo/media:/home/xingnanzhu/videos:ro" \
  nginx:1.24-alpine >/dev/null
token="$(sed -n 's/^"\([0-9a-f]*\)".*/\1/p' "$map" | head -1)"
echo "nginx 已启动。邀请链接：http://localhost:8088/?k=$token"
echo "停止：docker rm -f threader-local"
