#!/usr/bin/env bash
# End-to-end tests: the real server actions and PDF route against a real Postgres, through PostgREST
# (the same REST layer Supabase uses), with the migrations and row level security applied.
#
# You need: a Postgres with PostGIS you can create databases in, the PostgREST binary
# (https://github.com/PostgREST/postgrest/releases), and Chromium for the PDF test.
#
#   POSTGREST_BIN=/path/to/postgrest CHROME_PATH=/path/to/chrome \
#   PSQL="psql -h localhost -U postgres" ./tests/prospectpv/e2e/run.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PSQL="${PSQL:-psql}"; DB="${PVE2E_DB:-pv_e2e}"; PORT="${PVE2E_PORT:-3001}"; SECRET="e2e-secret-e2e-secret-e2e-secret-123456"
: "${POSTGREST_BIN:?set POSTGREST_BIN to the postgrest binary}"

$PSQL -q -d postgres -c "drop database if exists $DB" -c "create database $DB" -c "alter database $DB set search_path = public, extensions" 2>&1 | grep -v NOTICE || true
for f in "$ROOT/supabase/prospectpv/tests/00_local_supabase_stubs.sql" "$ROOT"/supabase/prospectpv/migrations/*.sql "$ROOT/supabase/prospectpv/tests/00_test_jwt_roles.sql"; do $PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null; done
$PSQL -q -d "$DB" <<SQL
do \$\$ begin if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit password 'authpw'; end if; end \$\$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public, extensions, auth, storage to authenticator;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1') on conflict do nothing;
SQL

CONF="$(mktemp)"; cat > "$CONF" <<CFG
db-uri = "postgres://authenticator:authpw@127.0.0.1:5432/$DB"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
jwt-secret = "$SECRET"
server-port = $PORT
CFG
"$POSTGREST_BIN" "$CONF" >/dev/null 2>&1 & PGRST=$!
trap 'kill $PGRST 2>/dev/null; rm -f "$CONF"' EXIT
for _ in $(seq 1 30); do curl -s -o /dev/null "localhost:$PORT/" && break; sleep 0.5; done

cd "$ROOT"
PVE2E_REST_URL="http://localhost:$PORT" PVE2E_JWT_SECRET="$SECRET" PVE2E_DB_URL="${PVE2E_DB_URL:-postgres://localhost/$DB}" npm run test:prospectpv:e2e
