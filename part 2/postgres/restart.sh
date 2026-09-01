#!/usr/bin/env bash
set -Eeuo pipefail

die() {
  printf 'postgres restart failed: %s\n' "$*" >&2
  exit 1
}

[[ "${EUID}" -eq 0 ]] || die "run this action as root"

PG_SERVICE="postgresql"
if ! systemctl list-unit-files "${PG_SERVICE}.service" --no-legend 2>/dev/null |
  awk 'NF { found=1 } END { exit !found }'; then
  PG_SERVICE="$(
    systemctl list-unit-files 'postgresql*.service' --no-legend 2>/dev/null |
      awk 'NF { sub(/\.service$/, "", $1); print $1; exit }'
  )"
fi

[[ -n "$PG_SERVICE" ]] || die "PostgreSQL systemd service was not found"

systemctl restart "$PG_SERVICE"
systemctl is-active --quiet "$PG_SERVICE" ||
  die "PostgreSQL service is not active: $PG_SERVICE"
printf 'PostgreSQL restarted successfully: %s\n' "$PG_SERVICE"
