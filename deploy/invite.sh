#!/bin/sh
# On the server: add an invited club and print its link.   deploy/invite.sh "厦门飞鹭"
# Revoke a club: delete its line from /etc/nginx/threader/invites.map, then
#   sudo -n /usr/sbin/nginx -t && sudo -n /usr/bin/systemctl reload nginx
# invites.map belongs to xingnanzhu, and sudoers allows exactly those two commands without a password
# (deploy/server-admin.sh, run once by the server admin).
set -e
club="$1"
map="${INVITES_MAP:-/etc/nginx/threader/invites.map}"
[ -n "$club" ] || { echo "用法：$0 俱乐部名" >&2; exit 1; }
token="$(openssl rand -hex 16)"
printf '"%s" "%s";\n' "$token" "$club" >> "$map"
sudo -n /usr/sbin/nginx -t && sudo -n /usr/bin/systemctl reload nginx
echo "已加入 $club。邀请链接："
echo "https://threader.matchmate.chat/?k=$token"
