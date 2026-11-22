#!/usr/bin/env bash
# Create or update a tenant and one of its domains in the tenant registry — no
# deploy needed; frontends pick the change up when their short cache expires.
#
#   scripts/provision-tenant.sh \
#     --tenant-id aerotake-b2c --name "AeroTake B2C" --currency BDT \
#     --host aerotake.example --channel B2C --brand "AeroTake" \
#     --logo /images/verticle_logo_1.png --primary "#0B3D5C" --accent "#F2A104" \
#     [--markup-profile b2c-default] [--agent-id <uuid>]   # agent-id: white-label only
#
# Re-running with the same --tenant-id / --host updates in place. Run once per domain.
# Database: DATABASE_URL if set (any psql-reachable Postgres), otherwise the postgres
# container of this repo's docker compose stack. Inputs go to psql as variables (:'x'),
# never spliced into SQL text; the channel and lowercase-host rules are enforced by
# database check constraints.
set -euo pipefail

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-1}"; }

tenant_id="" name="" currency="" host="" channel="" brand="" logo="" primary="" accent=""
markup="b2c-default" agent_id=""
while [[ $# -gt 0 ]]; do
  [[ "$1" == "-h" || "$1" == "--help" ]] && usage 0
  [[ $# -ge 2 ]] || { echo "missing value for $1" >&2; usage; }
  case "$1" in
    --tenant-id) tenant_id="$2" ;;  --name) name="$2" ;;  --currency) currency="$2" ;;
    --host) host="$2" ;;            --channel) channel="$2" ;;  --brand) brand="$2" ;;
    --logo) logo="$2" ;;            --primary) primary="$2" ;;  --accent) accent="$2" ;;
    --markup-profile) markup="$2" ;;  --agent-id) agent_id="$2" ;;
    *) echo "unknown option: $1" >&2; usage ;;
  esac
  shift 2
done

for v in tenant_id name currency host channel brand logo primary accent; do
  [[ -n "${!v}" ]] || { echo "--${v//_/-} is required" >&2; usage; }
done
[[ "$currency" =~ ^[A-Z]{3}$ ]] || { echo "--currency must be a 3-letter ISO code, e.g. BDT" >&2; exit 1; }
[[ "$tenant_id" =~ ^[a-z0-9][a-z0-9-]{1,98}$ ]] || { echo "--tenant-id must be lowercase letters, digits and dashes" >&2; exit 1; }
[[ -z "$agent_id" || "$agent_id" =~ ^[0-9a-fA-F-]{36}$ ]] || { echo "--agent-id must be a UUID" >&2; exit 1; }
host="$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')"
host="${host%%:*}"   # registry hosts have no port

if [[ -n "${DATABASE_URL:-}" ]]; then
  psql_cmd=(psql "$DATABASE_URL")
else
  cd "$(dirname "$0")/.."
  psql_cmd=(docker compose exec -T postgres psql -U "${POSTGRES_USER:-ota}" -d "${POSTGRES_DB:-ota}")
fi

"${psql_cmd[@]}" -v ON_ERROR_STOP=1 \
  -v tenant_id="$tenant_id" -v name="$name" -v currency="$currency" -v host="$host" \
  -v channel="$channel" -v brand="$brand" -v logo="$logo" -v primary="$primary" \
  -v accent="$accent" -v markup="$markup" -v agent_id="$agent_id" <<'SQL'
BEGIN;
INSERT INTO tenancy."Tenants" ("TenantId", "DisplayName", "SellCurrency", "IsActive", "CreatedAt")
VALUES (:'tenant_id', :'name', :'currency', true, now())
ON CONFLICT ("TenantId") DO UPDATE SET "DisplayName" = EXCLUDED."DisplayName", "SellCurrency" = EXCLUDED."SellCurrency";

INSERT INTO tenancy."TenantDomains" ("Id", "Host", "TenantId", "Channel", "AgentId", "BrandName", "LogoUrl",
                             "PrimaryColor", "AccentColor", "MarkupProfile", "IsActive", "CreatedAt")
VALUES (gen_random_uuid(), :'host', :'tenant_id', :'channel', NULLIF(:'agent_id', '')::uuid, :'brand', :'logo',
        :'primary', :'accent', :'markup', true, now())
ON CONFLICT ("Host") DO UPDATE SET "TenantId" = EXCLUDED."TenantId", "Channel" = EXCLUDED."Channel",
  "AgentId" = EXCLUDED."AgentId", "BrandName" = EXCLUDED."BrandName", "LogoUrl" = EXCLUDED."LogoUrl",
  "PrimaryColor" = EXCLUDED."PrimaryColor", "AccentColor" = EXCLUDED."AccentColor",
  "MarkupProfile" = EXCLUDED."MarkupProfile", "IsActive" = true;
COMMIT;
SQL
echo "provisioned: tenant=$tenant_id host=$host channel=$channel currency=$currency"
