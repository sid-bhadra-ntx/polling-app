#!/usr/bin/env bash

api_die() {
  printf 'API request failed: %s\n' "$*" >&2
  return 1
}

api_require_tools() {
  command -v curl >/dev/null 2>&1 || api_die "curl is required"
  if [[ -z "${API_TOKEN:-}" ]]; then
    command -v python3 >/dev/null 2>&1 || api_die "python3 is required when API_TOKEN is unset"
  fi
}

api_token() {
  local base_url="${API_BASE_URL:-}"
  local username="${SERVICE_ACCOUNT_USERNAME:-service_account}"
  local password="${SERVICE_ACCOUNT_PASSWORD:-}"
  local login_response

  [[ -n "$base_url" ]] || {
    api_die "API_BASE_URL is required"
    return 1
  }
  if [[ -n "${API_TOKEN:-}" ]]; then
    printf '%s' "$API_TOKEN"
    return 0
  fi
  [[ -n "$password" ]] || {
    api_die "SERVICE_ACCOUNT_PASSWORD is required when API_TOKEN is unset"
    return 1
  }

  login_response="$(
    python3 - "$username" "$password" <<'PY'
import json
import sys
print(json.dumps({"identifier": sys.argv[1], "password": sys.argv[2]}))
PY
  )" || return 1
  login_response="$(
    curl --fail --silent --show-error \
      -H 'Content-Type: application/json' \
      -d "$login_response" \
      "${base_url%/}/api/login"
  )" || return 1
  python3 -c 'import json, sys; print(json.load(sys.stdin)["token"])' <<<"$login_response"
}
