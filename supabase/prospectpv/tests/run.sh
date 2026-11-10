#!/usr/bin/env bash
# Runs the SQL checks on throwaway databases. Needs a Postgres with PostGIS where
# you can create databases; set PSQL to your connection command if not the default.
#   PSQL="psql -h localhost -U postgres" ./supabase/prospectpv/tests/run.sh
set -euo pipefail
PSQL="${PSQL:-psql}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# $2 = jwt: put back the simple JWT role lookup so tests can act as users by setting claims.
fresh() {
  $PSQL -q -d postgres -c "drop database if exists $1" -c "create database $1" -c "alter database $1 set search_path = public, extensions" 2>&1 | grep -v NOTICE || true
  for f in "$HERE/00_local_supabase_stubs.sql" "$HERE"/../migrations/*.sql; do $PSQL -q -v ON_ERROR_STOP=1 -d "$1" -f "$f" >/dev/null; done
  if [ "${2:-}" = jwt ]; then $PSQL -q -v ON_ERROR_STOP=1 -d "$1" -f "$HERE/00_test_jwt_roles.sql" >/dev/null; fi
}
run() { $PSQL -q -d "$1" -f "$HERE/$2.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //' | grep -E '^ok|FAIL|ERROR' || true; }
fail=0
fresh pv_t1 jwt; out="$(run pv_t1 prospectpv_behaviour; run pv_t1 prospectpv_rls; run pv_t1 prospectpv_map)"
fresh pv_t2 jwt; out+=$'\n'"$(run pv_t2 prospectpv_admin)"
fresh pv_t3; out+=$'\n'"$(run pv_t3 prospectpv_profiles_roles)"
echo "$out"
echo "passed: $(echo "$out" | grep -c '^ok')"
if echo "$out" | grep -qE 'FAIL|ERROR'; then echo "FAILURES"; exit 1; fi
