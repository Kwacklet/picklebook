# Official PostgreSQL image with our schema baked in.
# Files in /docker-entrypoint-initdb.d/ run automatically on the FIRST start
# (when the pg-data volume is empty).
# We copy the file into the image instead of using a bind mount, because
# Jenkins runs inside a container and bind-mount paths would point to the
# wrong place on the host.
FROM postgres:16-alpine

COPY init.sql /docker-entrypoint-initdb.d/01-init.sql
