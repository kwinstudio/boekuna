#!/usr/bin/env bash
# Replays every repository migration, in order, on a real PostgreSQL 17 database
# after the Supabase platform shim. pg_net is shimmed as plain functions.
set -euo pipefail
DB_URL="${1:?postgres url}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/tests/fixtures/supabase-platform-shim.sql" >/dev/null 2>&1
for f in "$ROOT"/supabase/migrations/*.sql; do
  sed -E 's/^\s*create extension if not exists pg_net[^;]*;//I' "$f" | psql "$DB_URL" -v ON_ERROR_STOP=1 -q >/dev/null \
    || { echo "migration failed: $(basename "$f")" >&2; exit 1; }
done
echo "replayed $(ls "$ROOT"/supabase/migrations/*.sql | wc -l) migrations"
