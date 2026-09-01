#!/usr/bin/env bash
set -Eeuo pipefail

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8080}"
timeout="${HEALTHCHECK_TIMEOUT_SECONDS:-5}"

curl --fail --silent --show-error --max-time "$timeout" \
  "$API_BASE_URL/api/health" >/dev/null
printf 'Backend HTTP endpoint is reachable at %s\n' "$API_BASE_URL"
