#!/usr/bin/env bash
# Create credentials for the frontends to call core-engine's gRPC service on behalf of visitors who are not
# logged in (search and offer revalidation only — they can never book).
#
#   scripts/generate-service-clients.sh                          # print the values
#   scripts/generate-service-clients.sh --write-env              # append to .env (only if SERVICE_CLIENTS is absent)
#   scripts/generate-service-clients.sh --b2c-tenant my-b2c      # tenant the B2C storefront may act for
#
# Prints three settings:
#   SERVICE_CLIENTS                 -> core-engine only: who may get service tokens, and what each may do.
#                                      Holds only a SHA-256 of each secret, never the secret itself.
#   FRONTEND_B2B_SERVICE_SECRET     -> the B2B frontend only (SERVICE_CLIENT_SECRET there)
#   FRONTEND_B2C_SERVICE_SECRET     -> the B2C frontend only
#
# Each secret is a random 256-bit value. Rotate one by generating a new secret, replacing that client's
# secretSha256 in SERVICE_CLIENTS, and updating that frontend; other clients are unaffected.
set -euo pipefail

write_env=false
b2c_tenant="aerotake-b2c"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --write-env) write_env=true; shift ;;
    --b2c-tenant) [[ $# -ge 2 ]] || { echo "--b2c-tenant needs a value" >&2; exit 1; }; b2c_tenant="$2"; shift 2 ;;
    -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done
[[ "$b2c_tenant" =~ ^[a-z0-9][a-z0-9-]{1,98}$ ]] || { echo "--b2c-tenant must be lowercase letters, digits and dashes" >&2; exit 1; }

secret() { openssl rand -hex 32; }
sha256() { printf '%s' "$1" | openssl dgst -sha256 -hex | awk '{print $NF}'; }

b2b_secret="$(secret)"; b2c_secret="$(secret)"
clients="[{\"id\":\"frontend-b2b\",\"secretSha256\":\"$(sha256 "$b2b_secret")\",\"scopes\":[\"search\",\"revalidate\"],\"channels\":[\"B2C\",\"B2B_AGENT\",\"B2B_SUB_AGENT\",\"WHITE_LABEL\"],\"tenants\":[\"*\"]},"
clients+="{\"id\":\"frontend-b2c\",\"secretSha256\":\"$(sha256 "$b2c_secret")\",\"scopes\":[\"search\",\"revalidate\"],\"channels\":[\"B2C\"],\"tenants\":[\"$b2c_tenant\"]}]"

if $write_env; then
  env_file="$(cd "$(dirname "$0")/.." && pwd)/.env"
  if [[ -f "$env_file" ]] && grep -q '^SERVICE_CLIENTS=' "$env_file"; then
    echo "SERVICE_CLIENTS already set in $env_file — not overwriting (that would cut the frontends off)." >&2
    exit 1
  fi
  {
    printf "\nSERVICE_CLIENTS='%s'\n" "$clients"
    printf 'FRONTEND_B2B_SERVICE_SECRET=%s\n' "$b2b_secret"
    printf 'FRONTEND_B2C_SERVICE_SECRET=%s\n' "$b2c_secret"
  } >> "$env_file"
  echo "Appended SERVICE_CLIENTS and the two frontend secrets to $env_file" >&2
else
  printf "SERVICE_CLIENTS='%s'\n" "$clients"
  printf 'FRONTEND_B2B_SERVICE_SECRET=%s\n' "$b2b_secret"
  printf 'FRONTEND_B2C_SERVICE_SECRET=%s\n' "$b2c_secret"
fi
