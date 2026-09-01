#!/usr/bin/env bash
set -Eeuo pipefail

die() {
  printf 'postgres setup failed: %s\n' "$*" >&2
  exit 1
}

[[ "${EUID}" -eq 0 ]] || die "run this action as root"

DB_NAME="poll_app"
DB_USER="poll_app"
DB_PORT="5432"
DB_PASSWORD="${DB_PASSWORD:-}"
BACKEND_CIDR="${BACKEND_CIDR:-}"
SCHEMA_FILE="${SCHEMA_FILE:-/opt/poll-app/schema.sql}"
SERVICE_ACCOUNT_PASSWORD_HASH="${SERVICE_ACCOUNT_PASSWORD_HASH:-}"
PG_SERVICE="${PG_SERVICE:-postgresql}"

[[ -n "$DB_PASSWORD" ]] || die "DB_PASSWORD is required"
[[ -n "$BACKEND_CIDR" ]] || die "BACKEND_CIDR is required"
[[ -f "$SCHEMA_FILE" ]] || die "schema file not found: $SCHEMA_FILE"
[[ "$DB_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "DB_NAME is not a safe SQL identifier"
[[ "$DB_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "DB_USER is not a safe SQL identifier"
[[ "$DB_PASSWORD" != *$'\n'* ]] || die "DB_PASSWORD must not contain a newline"
[[ "$BACKEND_CIDR" =~ ^[A-Za-z0-9:./_-]+$ ]] || die "BACKEND_CIDR contains unsupported characters"

install_packages() {
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y curl postgresql postgresql-server
  elif command -v yum >/dev/null 2>&1; then
    yum install -y curl postgresql postgresql-server
  elif command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y curl postgresql postgresql-contrib
  else
    die "supported package manager not found"
  fi
}

install_packages

if ! systemctl list-unit-files "${PG_SERVICE}.service" --no-legend 2>/dev/null | awk 'NF { found=1 } END { exit !found }'; then
  detected_service="$(
    systemctl list-unit-files 'postgresql*.service' --no-legend 2>/dev/null |
      awk 'NF { sub(/\.service$/, "", $1); print $1; exit }'
  )"
  [[ -n "$detected_service" ]] && PG_SERVICE="$detected_service"
fi

if command -v postgresql-setup >/dev/null 2>&1 &&
  [[ ! -f /var/lib/pgsql/data/PG_VERSION ]]; then
  postgresql-setup --initdb --unit "$PG_SERVICE" 2>/dev/null ||
    postgresql-setup --initdb
fi

systemctl enable --now "$PG_SERVICE"

run_psql() {
  runuser -u postgres -- psql "$@"
}

CONFIG_FILE="$(run_psql -Atqc 'SHOW config_file')"
HBA_FILE="$(run_psql -Atqc 'SHOW hba_file')"

if awk '$1 !~ /^#/ && $1 == "listen_addresses" { found=1 } END { exit !found }' "$CONFIG_FILE"; then
  sed -i -E "s|^[#[:space:]]*listen_addresses[[:space:]]*=.*|listen_addresses = '*'|" "$CONFIG_FILE"
else
  printf "\nlisten_addresses = '*'\n" >>"$CONFIG_FILE"
fi

HBA_MARKER="# poll-app Calm backend access"
sed -i "\|${HBA_MARKER}|d" "$HBA_FILE"
printf '%s\nhost %s %s %s scram-sha-256\n' \
  "$HBA_MARKER" "$DB_NAME" "$DB_USER" "$BACKEND_CIDR" >>"$HBA_FILE"

systemctl restart "$PG_SERVICE"

run_psql -v ON_ERROR_STOP=1 -v db_user="$DB_USER" -v db_password="$DB_PASSWORD" \
  -d postgres <<'SQL'
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'db_user') THEN
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'db_user', :'db_password');
  ELSE
    EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L', :'db_user', :'db_password');
  END IF;
END
$do$;
SQL

if [[ -z "$(run_psql -Atqc "SELECT 1 FROM pg_catalog.pg_database WHERE datname = '${DB_NAME}'" -d postgres)" ]]; then
  run_psql -v ON_ERROR_STOP=1 -v db_name="$DB_NAME" -v db_user="$DB_USER" \
    -d postgres -c 'CREATE DATABASE :"db_name" OWNER :"db_user";'
fi

run_psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -f "$SCHEMA_FILE"

if [[ -n "$SERVICE_ACCOUNT_PASSWORD_HASH" ]]; then
  run_psql -v ON_ERROR_STOP=1 -v service_account_hash="$SERVICE_ACCOUNT_PASSWORD_HASH" \
    -d "$DB_NAME" -c \
    "UPDATE users SET password_hash = :'service_account_hash' WHERE username = 'service_account';"
fi

printf 'PostgreSQL is configured for %s and backend network %s\n' "$DB_NAME" "$BACKEND_CIDR"
