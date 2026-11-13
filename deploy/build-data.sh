#!/bin/sh
# Run on the server: rebuild site-data/ from ~/data/opta and ~/videos. Rerun after new lake data or a new video.
# Uses a plain virtualenv with packages from the Tencent PyPI mirror (pypi.org is slow from the server).
set -e
repo="$(cd "$(dirname "$0")/.." && pwd)"
venv="$repo/pipeline/.venv-server"
mirror="${PIP_INDEX_URL:-https://mirrors.cloud.tencent.com/pypi/simple}"
if [ ! -x "$venv/bin/python" ]; then
  python3 -m venv "$venv"
  "$venv/bin/pip" install -q -i "$mirror" "pyarrow>=17" "pypinyin>=0.55.0"
fi
cd "$repo/pipeline"
PYTHONPATH=. "$venv/bin/python" -m threader_demo.site
# nginx (www-data) reads these through the home directory, which allows traversal only
chmod -R o+rX "$repo/site-data"
