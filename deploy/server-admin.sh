#!/bin/sh
# Run ONCE by the server admin (a user with sudo), not by xingnanzhu, who has no sudo password.
#   sudo sh /home/xingnanzhu/threader-web-demo/deploy/server-admin.sh
# 1. Replaces the placeholder /etc/nginx/conf.d/threader.matchmate.chat.conf with the real site config
#    (wildcard *.matchmate.chat cert, invite gate). The placeholder is kept in /etc/nginx/threader/.
#    If `nginx -t` fails, the placeholder goes back and nginx is not reloaded.
# 2. Creates /etc/nginx/threader/invites.map owned by xingnanzhu (mode 600; the nginx master reads it as root),
#    so invites are added without sudo.
# 3. Lets xingnanzhu run exactly `nginx -t` and `systemctl reload nginx` as root without a password,
#    nothing else, so a new invite or a git pull of the config can take effect.
set -e
[ "$(id -u)" = 0 ] || { echo "用 sudo 运行：sudo sh $0" >&2; exit 1; }
conf=/etc/nginx/conf.d/threader.matchmate.chat.conf
repo=/home/xingnanzhu/threader-web-demo

mkdir -p /etc/nginx/threader
if [ -f "$conf" ] && ! grep -q threader-site.inc "$conf"; then cp "$conf" /etc/nginx/threader/placeholder.conf.bak; fi
[ -f /etc/nginx/threader/invites.map ] || install -m 600 -o xingnanzhu -g xingnanzhu /dev/null /etc/nginx/threader/invites.map
cp "$repo/deploy/nginx/threader.conf" "$conf"
if ! nginx -t; then
  [ -f /etc/nginx/threader/placeholder.conf.bak ] && cp /etc/nginx/threader/placeholder.conf.bak "$conf"
  echo "nginx 配置检查没通过，已恢复原来的占位配置，nginx 没有重新加载。" >&2
  exit 1
fi
systemctl reload nginx

rule='xingnanzhu ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/bin/systemctl reload nginx'
printf '%s\n' "$rule" > /etc/sudoers.d/threader.tmp
chmod 440 /etc/sudoers.d/threader.tmp
if visudo -cf /etc/sudoers.d/threader.tmp >/dev/null; then mv /etc/sudoers.d/threader.tmp /etc/sudoers.d/threader
else rm -f /etc/sudoers.d/threader.tmp; echo "sudoers 规则检查没通过，没有加" >&2; exit 1; fi
echo "完成：threader.matchmate.chat 已切到正式配置；xingnanzhu 可以自己加邀请并重新加载 nginx。"
