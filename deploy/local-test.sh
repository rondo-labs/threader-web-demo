#!/bin/sh
# Run on the Mac: publish the site the way the server does (deploy/build-data.sh) into a local folder and serve it
# with nginx 1.24 under the server's static config, at http://localhost:8088. Needs Docker and web/dist (pnpm build).
set -e
repo="$(cd "$(dirname "$0")/.." && pwd)"
pub="$repo/.publish-local"
mkdir -p "$pub"
THREADER_PUBLIC="$pub" THREADER_MEDIA_DIR="$repo/media" THREADER_PYTHON="$repo/pipeline/.venv/bin/python" "$repo/deploy/build-data.sh"
docker rm -f threader-local >/dev/null 2>&1 || true
docker run -d --name threader-local -p 8088:8080 \
  -v "$pub":/var/www/threader.matchmate.chat/public:ro \
  -v "$repo/deploy/nginx/static-site.conf":/etc/nginx/conf.d/default.conf:ro \
  nginx:1.24-alpine >/dev/null
echo "http://localhost:8088"
