# server context, shared by the real site (threader.conf) and the local Docker test (local.conf).
# Paths are the server's: the repo clone, its built app and data, and the published videos.
# Every page, data file and video needs a valid invite cookie (docs/adr/0002); nothing is indexed.

access_log /var/log/nginx/threader.access.log threader;
absolute_redirect off;  # redirects keep the host and port the visitor used
add_header X-Robots-Tag "noindex, nofollow" always;

error_page 403 /invite-only.html;
location = /invite-only.html {
    internal;
    root /home/xingnanzhu/threader-web-demo/deploy/static;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header Cache-Control "no-store" always;
}
location = /robots.txt {
    default_type text/plain;
    return 200 "User-agent: *\nDisallow: /\n";
}

location / {
    # An invite link: keep the token in a cookie for 180 days and drop it from the address.
    if ($invite_from_link != "") {
        add_header Set-Cookie "threader_invite=$arg_k; Path=/; Max-Age=15552000; HttpOnly; SameSite=Lax$threader_cookie_flags" always;
        add_header X-Robots-Tag "noindex, nofollow" always;
        return 302 $uri;
    }
    if ($invite_club = "") {
        return 403;
    }
    root /home/xingnanzhu/threader-web-demo/web/dist;
    try_files $uri /index.html;
}
location /assets/ {
    if ($invite_club = "") {
        return 403;
    }
    root /home/xingnanzhu/threader-web-demo/web/dist;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}
location /data/ {
    if ($invite_club = "") {
        return 403;
    }
    alias /home/xingnanzhu/threader-web-demo/site-data/;
    add_header Cache-Control "no-cache" always;
}
location /media/ {
    if ($invite_club = "") {
        return 403;
    }
    # Plain static files: nginx answers Range requests, so the player can jump straight to a clip.
    alias /home/xingnanzhu/videos/;
    add_header Cache-Control "private, max-age=86400" always;
}
