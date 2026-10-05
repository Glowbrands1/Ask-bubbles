#!/usr/bin/env bash
# ============================================================================
# APPLY EVERY MIGRATION TO A THROWAWAY LOCAL POSTGRES, THEN TRY TO BREAK IT
# ============================================================================
#
#   bash scripts/db/verify-migrations.sh            # apply + run supabase/tests/*.sql
#   KEEP=1 bash scripts/db/verify-migrations.sh     # leave the cluster running
#
# Local only: a fresh cluster in $VERIFY_DIR (default /tmp/ask-bubbles-verify),
# Supabase's role and default-privilege shape from scripts/local-stack/
# bootstrap.sql, the auth stand-ins from local-auth-stub.sql, then every file
# in supabase/migrations in order, as the non-superuser `postgres` role, each
# in its own transaction — exactly how Supabase applies them. It never touches
# a remote project.
#
# Requires PostgreSQL 16 binaries and pgvector (postgresql-16-pgvector).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
ROOT="${VERIFY_DIR:-/tmp/ask-bubbles-verify}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${VERIFY_PORT:-54339}"

run_as_postgres() {
  if [ "$(id -u)" = "0" ]; then su postgres -c "$1"; else bash -c "$1"; fi
}

if [ -f "$ROOT/pg/postmaster.pid" ]; then
  run_as_postgres "$PGBIN/pg_ctl -D $ROOT/pg -m immediate stop" >/dev/null 2>&1 || true
fi
rm -rf "$ROOT"
mkdir -p "$ROOT"
[ "$(id -u)" = "0" ] && chown postgres "$ROOT"

run_as_postgres "$PGBIN/initdb -D $ROOT/pg -U supabase_admin --auth=trust >/dev/null"
run_as_postgres "$PGBIN/pg_ctl -D $ROOT/pg -o '-p $PORT -k $ROOT -c listen_addresses=127.0.0.1' -l $ROOT/pg.log -w start >/dev/null"

ADMIN=(psql -h 127.0.0.1 -p "$PORT" -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q)
AS_POSTGRES=(psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${ADMIN[@]}" -f "$REPO/scripts/local-stack/bootstrap.sql"
"${ADMIN[@]}" -f "$HERE/local-auth-stub.sql"

count=0
for migration in "$REPO"/supabase/migrations/*.sql; do
  if ! "${AS_POSTGRES[@]}" -1 -f "$migration" >"$ROOT/migration.out" 2>"$ROOT/migration.err"; then
    echo "FAILED: $(basename "$migration")"
    cat "$ROOT/migration.err"
    exit 1
  fi
  count=$((count + 1))
done
echo "applied $count migrations"

for check in "$REPO"/supabase/tests/*.sql; do
  [ -e "$check" ] || continue
  if ! "${ADMIN[@]}" -f "$check" >"$ROOT/check.out" 2>&1; then
    echo "CHECK FAILED: $(basename "$check")"
    cat "$ROOT/check.out"
    exit 1
  fi
  echo "check passed: $(basename "$check")"
done

if [ "${KEEP:-0}" != "1" ]; then
  run_as_postgres "$PGBIN/pg_ctl -D $ROOT/pg -m fast stop" >/dev/null
fi
