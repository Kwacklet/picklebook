#!/bin/sh
# Smoke test: checks, THROUGH THE REVERSE PROXY, that
#   1. courts-api is healthy (and can reach the database)
#   2. reservations-api is healthy (and can reach the database)
#   3. the frontend is serving the expected build number
#
# Usage (from the repo root):  TAG=15 sh scripts/smoke-test.sh
# Exit code 0 = passed, 1 = failed.

EXPECTED_TAG="${TAG:-dev}"
ATTEMPTS="${ATTEMPTS:-20}"
BASE="http://127.0.0.1:8080"

check() {
  docker compose exec -T proxy wget -qO- "$BASE$1" 2>/dev/null
}

i=1
while [ "$i" -le "$ATTEMPTS" ]; do
  if check /api/courts/health > /dev/null \
     && check /api/reservations/health > /dev/null \
     && check /config.js | grep -q "\"$EXPECTED_TAG\""; then
    echo "Smoke test PASSED: build $EXPECTED_TAG is live and all services are healthy"
    check /api/courts/health; echo
    check /api/reservations/health; echo
    exit 0
  fi
  echo "Waiting for services to become healthy ($i/$ATTEMPTS)..."
  sleep 3
  i=$((i + 1))
done

echo "Smoke test FAILED: build $EXPECTED_TAG did not become healthy"
docker compose ps
exit 1
