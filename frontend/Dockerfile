# Frontend: static HTML/CSS/JS served by an unprivileged (non-root) nginx.
FROM nginxinc/nginx-unprivileged:1.28-alpine

# Jenkins passes the build number here (docker-compose.yml -> build.args)
ARG BUILD_NUMBER=dev

USER root
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public/ /usr/share/nginx/html/
# Generate config.js so the page can show which build is running
RUN printf 'window.APP_BUILD = "%s";\n' "$BUILD_NUMBER" > /usr/share/nginx/html/config.js

# Drop back to the image's non-root user
USER nginx

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ > /dev/null || exit 1
