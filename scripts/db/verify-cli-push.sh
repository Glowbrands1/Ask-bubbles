#!/usr/bin/env bash
# ============================================================================
# THE REAL SUPABASE CLI AGAINST A PRODUCTION-LIKE DATABASE (disposable, local)
# ============================================================================
#
# Proves, with the real `supabase db push`, the production reconciliation in
# docs/migration-reconciliation-2026-10-19.md section 4:
#   - without --include-all the CLI refuses (20261014001000 sorts before the newest history entry);
#   - with --include-all BEFORE the two history rows, it would re-apply 20261015001000 and 20261016001000
#     (the hazard step 1 removes);
#   - after step 1 (the exact SQL from the report), a dry run lists exactly the migrations that are really pending;
#   - the real push applies them, the history then holds one row per file, and a second dry run is "up to date";
#   - the result is identical, object for object, to a fresh build.
# It connects as the owner role `postgres` (not a superuser), like the real migration role.
#
#   SUPABASE_BIN=/path/to/supabase bash scripts/db/verify-cli-push.sh
# (SUPABASE_BIN: `npm i supabase` in a scratch directory gives node_modules/.bin/supabase.)
# Needs root or the postgres OS user, like the other scripts here. Never touches a real project.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SB="${SUPABASE_BIN:?set SUPABASE_BIN to the supabase CLI binary}"
ROOT="${CLI_DIR:-/tmp/ask-bubbles-cli}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PROD_PORT="${CLI_PROD_PORT:-54472}"
FRESH_PORT="${CLI_FRESH_PORT:-54471}"
PG="psql -h 127.0.0.1 -p $PROD_PORT -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 -q"
URL="postgres://postgres@127.0.0.1:$PROD_PORT/postgres?sslmode=disable"

stop() {
  for d in prod fresh; do
    [ -f "$ROOT/$d/pg/postmaster.pid" ] && { if [ "$(id -u)" = 0 ]; then su postgres -c "$PGBIN/pg_ctl -D $ROOT/$d/pg -m immediate stop" >/dev/null 2>&1; else "$PGBIN/pg_ctl" -D "$ROOT/$d/pg" -m immediate stop >/dev/null 2>&1; fi; } || true
  done
}
fail() { echo "CLI CHECK FAILED: $*"; stop; exit 1; }
trap stop EXIT
rm -rf "$ROOT"; mkdir -p "$ROOT"

echo "== building the FRESH reference and the PRODUCTION-like database (37 history rows)"
PARITY_DIR="$ROOT/fresh" PARITY_PORT="$FRESH_PORT" PARITY_DUMP_FRESH="$ROOT/fresh.fp" bash "$HERE/verify-production-parity.sh" >/dev/null 2>&1 || fail "fresh build"
PARITY_DIR="$ROOT/prod" PARITY_PORT="$PROD_PORT" PARITY_DUMP_PRODUCTION_LIKE="$ROOT/prod0.fp" bash "$HERE/verify-production-parity.sh" >/dev/null 2>&1 || fail "production-like build"
$PG -c "grant all on schema supabase_migrations to postgres; grant all on supabase_migrations.schema_migrations to postgres" >/dev/null

mkdir -p "$ROOT/project/supabase" && cp -r "$REPO/supabase/migrations" "$ROOT/project/supabase/migrations"
cd "$ROOT/project"
"$SB" --version >/dev/null || fail "cannot run the CLI"
echo "   CLI $("$SB" --version)"
pending_json() { "$SB" db push --db-url "$URL" "$@" 2>&1 | grep '^{' | tail -1; }
versions() { sed -E 's/.*"migrations":\[([^]]*)\].*/\1/' | tr ',' '\n' | sed -E 's/^"?([0-9]{14}).*/\1/' | grep -E '^[0-9]{14}$' | LC_ALL=C sort | tr '\n' ' '; }

echo "== 1. plain dry run must refuse"
OUT="$("$SB" db push --db-url "$URL" --dry-run 2>&1 || true)"
echo "$OUT" | grep -q DbPushMissingRemoteError || fail "expected the out-of-order refusal; got: $OUT"
echo "   refused as expected (20261014001000 is before the newest history entry)"

echo "== 2. --include-all dry run BEFORE the history rows: the hazard"
BEFORE="$(pending_json --include-all --dry-run | versions)"
echo "$BEFORE" | grep -q 20261015001000 && echo "$BEFORE" | grep -q 20261016001000 || fail "expected the unrecorded migrations to be listed; got: $BEFORE"
echo "   lists the two fully-applied-but-unrecorded migrations: $BEFORE"

echo "== 3. step 1 exactly as written in the report, as the owner role"
awk '/^\*\*Step 1/ {on=1} on && /^```sql/ {grab=1; next} grab && /^```/ {exit} grab {print}' "$REPO/docs/migration-reconciliation-2026-10-19.md" >"$ROOT/step1.sql"
[ "$(wc -l <"$ROOT/step1.sql")" -ge 8 ] || fail "could not extract step 1"
psql -h 127.0.0.1 -p "$PROD_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f "$ROOT/step1.sql" >/dev/null
[ "$($PG -c 'select count(*) from supabase_migrations.schema_migrations')" = 39 ] || fail "expected 39 history rows after step 1"

echo "== 4. --include-all dry run AFTER step 1: exactly what is really pending"
EXPECTED="$({ ls "$REPO/supabase/migrations" | cut -c1-14; } | LC_ALL=C sort | comm -23 - <($PG -c 'select version from supabase_migrations.schema_migrations' | LC_ALL=C sort) | tr '\n' ' ')"
AFTER="$(pending_json --include-all --dry-run | versions)"
[ "$AFTER" = "$EXPECTED" ] || fail "dry run lists [$AFTER], expected [$EXPECTED]"
echo "   lists exactly: $AFTER"

echo "== 5. the real push"
"$SB" db push --db-url "$URL" --include-all 2>&1 | grep -E "Applying|ERROR|Error" || true
[ "$($PG -c "select count(*) from supabase_migrations.schema_migrations")" = "$(ls "$REPO/supabase/migrations" | wc -l)" ] || fail "history rows do not equal migration files"
for v in $EXPECTED; do
  [ "$($PG -c "select coalesce(array_length(statements,1),0) > 0 from supabase_migrations.schema_migrations where version = '$v'")" = t ] || fail "the CLI recorded no statements for $v"
done
pending_json --include-all --dry-run | grep -q '"upToDate":true' || fail "a second dry run is not up to date"
echo "   history holds one row per file; a second dry run is up to date"

echo "== 6. identical to a fresh build, and the check files pass"
$PG -f "$HERE/fingerprint.sql" | LC_ALL=C sort >"$ROOT/after.fp"
diff "$ROOT/after.fp" "$ROOT/fresh.fp" >/dev/null || { diff "$ROOT/after.fp" "$ROOT/fresh.fp" | head; fail "the pushed database differs from a fresh build"; }
echo "   identical to FRESH ($(wc -l <"$ROOT/fresh.fp") objects)"
for f in "$REPO"/supabase/tests/*_checks.sql; do
  $PG -f "$f" >/dev/null 2>&1 || fail "$(basename "$f") failed after the push"
  echo "   $(basename "$f") passes"
done
echo "== 7. the rollback of the termination migration (supabase/rollbacks): refuses once enforcement acted, otherwise restores the capture state"
RB="$REPO/supabase/rollbacks/20261019001000_woven_disable_terminated_down.sql"
OWNER="psql -h 127.0.0.1 -p $PROD_PORT -U postgres -d postgres -At -q"
REFUSED="$({ echo "begin; insert into public.employee_access_runs (mode, requested_by, policy_version, status, guard_codes, counts) values ('apply','x','p','completed','{}','{}');"; cat "$RB"; echo "rollback;"; } | $OWNER 2>&1 | grep -ci "rollback refused" || true)"
[ "$REFUSED" = 1 ] || fail "the rollback did not refuse while an apply run existed"
$OWNER -v ON_ERROR_STOP=1 -1 -f "$RB" >/dev/null || fail "the rollback failed"
$PG -f "$HERE/fingerprint.sql" | LC_ALL=C sort >"$ROOT/rolledback.fp"
diff "$ROOT/rolledback.fp" "$ROOT/fresh.fp.capture" >/dev/null || fail "after the rollback the database differs from the state at the capture migration"
echo "   refused with an apply run present; otherwise identical to the capture state ($(wc -l <"$ROOT/rolledback.fp") objects)"
echo "CLI PUSH: reconciliation proven with the real Supabase CLI"
