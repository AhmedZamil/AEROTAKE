#!/usr/bin/env bash
# Pull the images recorded in /opt/aerotake/image-tags.env and restart the production stack.
# On a failed health check, restore the previous tags and start those containers again.
#
#   deploy.sh --owner <github-owner> [--core <git-sha>] [--b2c <git-sha>]
set -euo pipefail

ROOT=/opt/aerotake
cd "$ROOT"

OWNER=""
CORE=""
B2C=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner) OWNER="${2:-}"; shift 2 ;;
    --core) CORE="${2:-}"; shift 2 ;;
    --b2c) B2C="${2:-}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ ! -f .env ]]; then
  echo "missing $ROOT/.env — copy deploy/env.example and fill it in before the first deploy" >&2
  exit 1
fi

update_kv() {
  local key="$1" value="$2" file="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

touch image-tags.env
cp image-tags.env image-tags.env.prev

[[ -n "$OWNER" ]] && update_kv GHCR_OWNER "$OWNER" image-tags.env
[[ -n "$CORE" ]] && update_kv CORE_IMAGE_TAG "$CORE" image-tags.env
[[ -n "$B2C" ]] && update_kv B2C_IMAGE_TAG "$B2C" image-tags.env

set -a
# shellcheck disable=SC1091
source image-tags.env
set +a

: "${GHCR_OWNER:?GHCR_OWNER missing}"
: "${CORE_IMAGE_TAG:?CORE_IMAGE_TAG missing — run the Deploy workflow once with core-engine selected}"
: "${B2C_IMAGE_TAG:?B2C_IMAGE_TAG missing — run the Deploy workflow once with frontend-b2c selected}"

compose() {
  docker compose --env-file .env --env-file image-tags.env -f docker-compose.prod.yml "$@"
}

rollback() {
  echo "health check failed; restoring the previous image tags" >&2
  if [[ ! -s image-tags.env.prev ]]; then
    echo "no previous tags to restore" >&2
    exit 1
  fi
  cp image-tags.env.prev image-tags.env
  set -a
  # shellcheck disable=SC1091
  source image-tags.env
  set +a
  compose up -d --remove-orphans
  exit 1
}

if ! compose pull || ! compose up -d --remove-orphans; then
  rollback
fi

ok=0
for _ in $(seq 1 36); do
  if compose exec -T core-engine curl -fsS http://127.0.0.1:8080/healthz >/dev/null; then
    ok=1
    break
  fi
  sleep 5
done
[[ "$ok" -eq 1 ]] || rollback

site_url="$(grep -E '^SITE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
if [[ -n "$site_url" ]]; then
  if ! curl -fsS -o /dev/null --retry 5 --retry-delay 3 --retry-connrefused "$site_url"; then
    rollback
  fi
fi

echo "deployed core=${CORE_IMAGE_TAG} storefront=${B2C_IMAGE_TAG}"
