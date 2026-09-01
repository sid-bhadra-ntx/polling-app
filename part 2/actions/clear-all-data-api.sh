#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../common/api-auth.sh
source "$SCRIPT_DIR/../common/api-auth.sh"

API_BASE_URL="${API_BASE_URL:-}"
API_TOKEN="${API_TOKEN:-}"
SERVICE_ACCOUNT_USERNAME="${SERVICE_ACCOUNT_USERNAME:-service_account}"
SERVICE_ACCOUNT_PASSWORD="${SERVICE_ACCOUNT_PASSWORD:-}"

[[ -n "$API_BASE_URL" ]] || {
  api_die "API_BASE_URL is required"
  exit 1
}
[[ -n "$API_TOKEN" || -n "$SERVICE_ACCOUNT_PASSWORD" ]] || {
  api_die "set API_TOKEN or SERVICE_ACCOUNT_PASSWORD"
  exit 1
}
api_require_tools || exit 1

API_BASE_URL="${API_BASE_URL%/}"

API_TOKEN="$(api_token)" || exit 1

curl --fail --silent --show-error \
  -X POST \
  -H "Authorization: Bearer $API_TOKEN" \
  "$API_BASE_URL/api/admin/clear-data"
printf '\nAll poll data was removed through the API.\n'
