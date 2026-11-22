#!/usr/bin/env bash
# Write b2c=, core=, and proto= lines for $GITHUB_OUTPUT.
# BASE_SHA is the commit to diff against. An all-zero SHA (a new branch) or FORCE_BOTH=true builds everything.
set -euo pipefail

if [[ "${FORCE_BOTH:-}" == "true" ]]; then
  printf 'b2c=true\ncore=true\nproto=true\n'
  exit 0
fi

if [[ -z "${BASE_SHA:-}" || "$BASE_SHA" =~ ^0+$ ]]; then
  printf 'b2c=true\ncore=true\nproto=true\n'
  exit 0
fi

files="$(git diff --name-only "$BASE_SHA" HEAD)"
b2c=false
core=false
proto=false
if grep -qE '^ota-polyglot-platform/(apps/frontend-b2c/|shared/protos/)' <<< "$files"; then b2c=true; fi
if grep -qE '^ota-polyglot-platform/(apps/core-engine-dotnet/|shared/protos/)' <<< "$files"; then core=true; fi
# A deploy-pipeline change must rebuild: the previous image push may have failed.
if grep -qE '^\.github/workflows/deploy\.yml$' <<< "$files"; then b2c=true; core=true; fi
if grep -qE '^ota-polyglot-platform/shared/protos/ota.proto$' <<< "$files"; then proto=true; fi
printf 'b2c=%s\ncore=%s\nproto=%s\n' "$b2c" "$core" "$proto"
