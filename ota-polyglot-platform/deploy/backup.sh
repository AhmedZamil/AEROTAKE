#!/usr/bin/env bash
# Dump the production database. Keeps 14 days of local copies.
# Set RCLONE_REMOTE (for example "r2:aerotake-backups") to copy each dump off the server.
set -euo pipefail

cd /opt/aerotake
mkdir -p /opt/aerotake/backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="/opt/aerotake/backups/ota-${stamp}.dump"

docker compose --env-file .env --env-file image-tags.env -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$out"

find /opt/aerotake/backups -name 'ota-*.dump' -mtime +14 -delete

if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  rclone copy "$out" "$RCLONE_REMOTE"
fi

echo "wrote $out"
