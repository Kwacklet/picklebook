# Reservations API - multi-stage build
#   base       -> installs ALL dependencies (including test tools) and copies the code
#   test       -> runs the Jest tests; Jenkins runs: docker build --target test ./reservations-api
#                 If any test fails, the build fails and the pipeline stops before Deploy.
#   production -> small final image: production dependencies only, runs as non-root

FROM node:22-alpine AS base
WORKDIR /app
# Copy only the dependency files first so Docker can cache "npm ci"
# when only the source code changes
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

FROM base AS test
RUN npm test

FROM node:22-alpine AS production
ENV NODE_ENV=production \
    PORT=3002
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=base /app/src ./src

# The official node image already has a non-root user called "node"
USER node
EXPOSE 3002
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/health > /dev/null || exit 1
CMD ["node", "src/server.js"]
