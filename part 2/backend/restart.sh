#!/usr/bin/env bash
set -Eeuo pipefail

systemctl restart poll-app.service
systemctl is-active --quiet poll-app.service
printf 'Poll application restarted successfully.\n'
