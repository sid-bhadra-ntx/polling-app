#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../common/api-auth.sh
source "$SCRIPT_DIR/../common/api-auth.sh"

POLL_ID="${POLL_ID:-${1:-}}"
OPTION_ID="${OPTION_ID:-${2:-}}"

[[ "$POLL_ID" =~ ^[1-9][0-9]*$ ]] || {
  printf 'POLL_ID must be a positive integer.\n' >&2
  exit 1
}
[[ "$OPTION_ID" =~ ^[1-9][0-9]*$ ]] || {
  printf 'OPTION_ID must be a positive integer.\n' >&2
  exit 1
}

api_require_tools
token="$(api_token)"
curl --fail --silent --show-error \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $token" \
  -d "{\"option_id\":$OPTION_ID}" \
  "${API_BASE_URL%/}/api/polls/$POLL_ID/vote"
printf '\nVote recorded successfully.\n'
