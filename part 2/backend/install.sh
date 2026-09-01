#!/usr/bin/env bash
set -Eeuo pipefail

die() {
  printf 'backend install failed: %s\n' "$*" >&2
  exit 1
}

[[ "${EUID}" -eq 0 ]] || die "run this action as root"

APP_REPOSITORY_URL="${APP_REPOSITORY_URL:-}"
APP_REF="${APP_REF:-main}"
APP_DIR="${APP_DIR:-/opt/poll-app}"
APP_USER="${APP_USER:-pollapp}"
DB_HOST="${DB_HOST:-}"
DB_PORT="5432"
DB_USER="poll_app"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="poll_app"
DB_SSLMODE="disable"
JWT_SECRET="${JWT_SECRET:-}"
APP_PORT="${APP_PORT:-8080}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

[[ -n "$APP_REPOSITORY_URL" ]] || die "APP_REPOSITORY_URL is required"
[[ -n "$DB_HOST" ]] || die "DB_HOST is required"
[[ -n "$DB_PASSWORD" ]] || die "DB_PASSWORD is required"
[[ -n "$JWT_SECRET" ]] || die "JWT_SECRET is required"
[[ "$APP_DIR" = /* ]] || die "APP_DIR must be an absolute path"
[[ "$DB_PASSWORD" != *$'\n'* && "$JWT_SECRET" != *$'\n'* ]] ||
  die "secrets must not contain newlines"

install_packages() {
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y curl git make golang nodejs npm
  elif command -v yum >/dev/null 2>&1; then
    yum install -y curl git make golang nodejs npm
  elif command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y curl git make golang-go nodejs npm
  else
    die "supported package manager not found"
  fi
}

install_packages

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

mkdir -p "$(dirname "$APP_DIR")"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch --depth 1 origin "$APP_REF"
  git -C "$APP_DIR" checkout --force "$APP_REF"
  git -C "$APP_DIR" reset --hard "origin/$APP_REF"
else
  rm -rf "$APP_DIR"
  if [[ -n "$GITHUB_TOKEN" ]]; then
    git -c "http.extraHeader=Authorization: Bearer $GITHUB_TOKEN" \
      clone --depth 1 --branch "$APP_REF" "$APP_REPOSITORY_URL" "$APP_DIR"
  else
    git clone --depth 1 --branch "$APP_REF" "$APP_REPOSITORY_URL" "$APP_DIR"
  fi
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"
runuser -u "$APP_USER" -- bash -c "cd '$APP_DIR' && make all"

cat >/etc/poll-app.env <<EOF
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
DB_SSLMODE=$DB_SSLMODE
JWT_SECRET=$JWT_SECRET
PORT=$APP_PORT
STATIC_DIR=static
EOF
chown root:root /etc/poll-app.env
chmod 600 /etc/poll-app.env

cat >/etc/systemd/system/poll-app.service <<EOF
[Unit]
Description=Poll application
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR/build
EnvironmentFile=/etc/poll-app.env
ExecStart=$APP_DIR/build/poll-app
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now poll-app.service
printf 'Backend installed and started from %s\n' "$APP_DIR"
