#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../common/api-auth.sh
source "$SCRIPT_DIR/../common/api-auth.sh"

TITLE="${POLL_TITLE:-${1:-}}"
DESCRIPTION="${POLL_DESCRIPTION:-${2:-}}"
OPTIONS_CSV="${POLL_OPTIONS:-${3:-}}"

[[ -n "$TITLE" ]] || {
  printf 'Usage: POLL_TITLE="..." POLL_OPTIONS="A,B" %s\n' "$0" >&2
  exit 1
}
[[ -n "$OPTIONS_CSV" ]] || {
  printf 'POLL_OPTIONS must contain at least two comma-separated options.\n' >&2
  exit 1
}

IFS=',' read -r -a options <<<"$OPTIONS_CSV"
[[ "${#options[@]}" -ge 2 ]] || {
  printf 'POLL_OPTIONS must contain at least two comma-separated options.\n' >&2
  exit 1
}

payload="$(
  python3 - "$TITLE" "$DESCRIPTION" "${options[@]}" <<'PY'
import json
import sys

title, description, *options = sys.argv[1:]
print(json.dumps({
    "title": title,
    "description": description,
    "options": [option.strip() for option in options],
}))
PY
)"

api_require_tools
token="$(api_token)"
curl --fail --silent --show-error \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $token" \
  -d "$payload" \
  "${API_BASE_URL%/}/api/polls"
printf '\nPoll created successfully.\n'
