#!/usr/bin/env bash
# Generate ES256 (P-256) signing keys and print the JWT_SIGNING_KEYS value core-engine reads.
#
#   scripts/generate-jwt-keys.sh                       # keys for all three audiences
#   scripts/generate-jwt-keys.sh ota-agents            # only the named audience(s)
#   scripts/generate-jwt-keys.sh --write-env           # also append JWT_SIGNING_KEYS to .env (only if absent)
#
# Output is ONE line of JSON: {"<audience>":{"active":"<kid>","keys":{"<kid>":"<base64 PKCS#8 private>"}}}
# Treat it like a password: it is the ability to mint tokens. Only core-engine gets it; frontends
# fetch the public half from core's /.well-known/jwks.json and hold no secret.
#
# ROTATION: generate a new key for an audience, then in JWT_SIGNING_KEYS make it "active" and keep the
# old entry but replace its private value with the PUBLIC key (base64 SubjectPublicKeyInfo) so tokens it
# already signed keep verifying:  openssl pkey -in old.pem -pubout -outform DER | base64 | tr -d '\n'
# Drop the old entry once the longest token lifetime (30 days, the refresh token) has passed.
set -euo pipefail

write_env=false
audiences=()
for a in "$@"; do
  case "$a" in
    --write-env) write_env=true ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    ota-agents|ota-customers|ota-internal) audiences+=("$a") ;;
    *) echo "unknown argument: $a (audiences: ota-agents ota-customers ota-internal)" >&2; exit 1 ;;
  esac
done
[[ ${#audiences[@]} -gt 0 ]] || audiences=(ota-agents ota-customers ota-internal)

json="{"
first=true
for aud in "${audiences[@]}"; do
  kid="${aud#ota-}-$(date -u +%Y%m%d)-$(openssl rand -hex 2)"
  # prime256v1 == P-256; pkcs8 DER is what core imports.
  priv="$(openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -outform DER | base64 | tr -d '\n')"
  $first || json+=","
  json+="\"$aud\":{\"active\":\"$kid\",\"keys\":{\"$kid\":\"$priv\"}}"
  first=false
done
json+="}"

if $write_env; then
  env_file="$(cd "$(dirname "$0")/.." && pwd)/.env"
  if [[ -f "$env_file" ]] && grep -q '^JWT_SIGNING_KEYS=' "$env_file"; then
    echo "JWT_SIGNING_KEYS already set in $env_file — not overwriting (that would log everyone out)." >&2
    exit 1
  fi
  printf "\nJWT_SIGNING_KEYS='%s'\n" "$json" >> "$env_file"
  echo "Appended JWT_SIGNING_KEYS to $env_file" >&2
else
  echo "$json"
fi
