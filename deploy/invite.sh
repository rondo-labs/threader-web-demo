#!/bin/sh
# On the server: add an invited club and print its link.   deploy/invite.sh "厦门飞鹭"
# Revoke a club: sudo nano /etc/nginx/threader/invites.map, delete its line, then sudo nginx -s reload.
set -e
club="$1"
map="${INVITES_MAP:-/etc/nginx/threader/invites.map}"
[ -n "$club" ] || { echo "用法：$0 俱乐部名" >&2; exit 1; }
token="$(openssl rand -hex 16)"
printf '"%s" "%s";\n' "$token" "$club" | sudo tee -a "$map" >/dev/null
sudo nginx -t -q && sudo nginx -s reload
echo "已加入 $club。邀请链接："
echo "https://threader.matchmate.chat/?k=$token"
