#!/usr/bin/env bash
set -Eeuo pipefail

die() {
  printf 'postgres cleanup failed: %s\n' "$*" >&2
  exit 1
}

[[ "${EUID}" -eq 0 ]] || die "run this action as root"

DB_NAME="poll_app"
MODE="${MODE:-votes}"
PG_SERVICE="${PG_SERVICE:-postgresql}"

[[ "$DB_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] ||
  die "DB_NAME is not a safe SQL identifier"
[[ "$MODE" == "votes" || "$MODE" == "all" ]] ||
  die "MODE must be votes or all"

systemctl is-active --quiet "$PG_SERVICE" ||
  die "PostgreSQL service is not active: $PG_SERVICE"

run_psql() {
  runuser -u postgres -- psql "$@"
}

if [[ "$MODE" == "votes" ]]; then
  run_psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -c \
    'TRUNCATE TABLE votes RESTART IDENTITY;'
  printf 'All votes were removed; users and polls were preserved.\n'
else
  run_psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -c \
    'TRUNCATE TABLE votes, options, polls RESTART IDENTITY CASCADE;'
  printf 'All poll data was removed; users were preserved.\n'
fi
