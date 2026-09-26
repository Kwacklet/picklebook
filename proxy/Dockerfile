# Reverse proxy: nginx with our routing config baked into the image
# (no bind mount, so it also works when Jenkins deploys it).
# The unprivileged image runs nginx as a non-root user on port 8080.
FROM nginxinc/nginx-unprivileged:1.28-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/proxy-health > /dev/null || exit 1
