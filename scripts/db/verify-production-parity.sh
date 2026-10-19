#!/usr/bin/env bash
# ============================================================================
# PROVE THE MIGRATION-HISTORY RECONCILIATION ON A DATABASE THAT LOOKS LIKE PRODUCTION
# ============================================================================
#
#   bash scripts/db/verify-production-parity.sh
#   PARITY_DIR=/tmp/p PARITY_PORT=54449 bash scripts/db/verify-production-parity.sh
#
# Disposable local Postgres only. It never touches a remote project. It needs the
# same binaries as scripts/db/verify-migrations.sh (PostgreSQL 16 and pgvector).
#
# What it builds, each on its own throwaway cluster:
#
#   FRESH       every repository migration applied in order. What a new environment gets.
#   PRODUCTION  the migrations up to 20261016001000, then supabase/tests/fixtures/
#               production_parity_state.sql (the hand-applied Ask Sunny objects, the
#               leftover 4-argument apply_reviews overload and the older monthly body),
#               then a supabase_migrations.schema_migrations table holding the history
#               entries the live database has (37).
#
# What it proves:
#
#   1. How PRODUCTION differs from FRESH is exactly the allow-listed set (the legacy
#      overload and the monthly body). Anything else is a failure.
#   2. Scenario A  record 20261015001000 and 20261016001000 in the history (metadata
#                  only), then apply what is still pending, as tooling would.
#      Scenario B  record nothing, apply everything pending (including those two files).
#      Both end identical to FRESH: tables, columns, indexes, constraints, triggers,
#      views, functions, privileges, row security, comments.
#   3. Applying the capture migration changes NOTHING about the Ask Sunny-derived
#      objects on PRODUCTION: the guard, its trigger, the grant, the audit list and
#      auth_clear_user_credentials are byte-for-byte what they were.
#   4. Re-applying 20261014001000 through the capture migration a second time changes nothing.
#   5. supabase/tests/capture_live_objects_checks.sql passes on the result.
#
# PARITY_DUMP_PRODUCTION_LIKE=/path/file writes the production-like database's object
# fingerprint (see scripts/db/fingerprint.sql) and stops, leaving it running: used to
# check the fixture against the live database with the same query.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
ROOT="${PARITY_DIR:-/tmp/ask-bubbles-parity}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${PARITY_PORT:-54449}"
LAST_APPLIED_ON_PRODUCTION="20261016001000"
CAPTURE="20261017001000"
MIGRATIONS="$REPO/supabase/migrations"
FINGERPRINT="$HERE/fingerprint.sql"

run_as_postgres() {
  if [ "$(id -u)" = "0" ]; then su postgres -c "$1"; else bash -c "$1"; fi
}

stop_cluster() {
  if [ -f "$ROOT/pg/postmaster.pid" ]; then
    run_as_postgres "$PGBIN/pg_ctl -D $ROOT/pg -m immediate stop" >/dev/null 2>&1 || true
  fi
}

new_cluster() {
  stop_cluster
  rm -rf "$ROOT"
  mkdir -p "$ROOT"
  [ "$(id -u)" = "0" ] && chown postgres "$ROOT"
  run_as_postgres "$PGBIN/initdb -D $ROOT/pg -U supabase_admin --auth=trust >/dev/null"
  run_as_postgres "$PGBIN/pg_ctl -D $ROOT/pg -o '-p $PORT -k $ROOT -c listen_addresses=127.0.0.1' -l $ROOT/pg.log -w start >/dev/null"
  admin -f "$REPO/scripts/local-stack/bootstrap.sql"
  admin -f "$HERE/local-auth-stub.sql"
}

admin()    { psql -h 127.0.0.1 -p "$PORT" -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
as_owner() { psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

version_of() { basename "$1" | cut -d_ -f1; }

apply_file() {
  if ! as_owner -1 -f "$1" >"$ROOT/apply.out" 2>"$ROOT/apply.err"; then
    echo "FAILED to apply $(basename "$1")"; cat "$ROOT/apply.err"; exit 1
  fi
}

apply_up_to() {
  local limit="$1"
  for f in "$MIGRATIONS"/*.sql; do
    [ "$(version_of "$f")" \> "$limit" ] && continue
    apply_file "$f"
  done
}

fingerprint() { admin -At -f "$FINGERPRINT" | LC_ALL=C sort; }

make_production_like() {
  apply_up_to "$LAST_APPLIED_ON_PRODUCTION"
  # As the owner role, because that is who owns the live objects.
  as_owner -f "$REPO/supabase/tests/fixtures/production_parity_state.sql" >/dev/null
  # The 4-argument apply_reviews overload that 20261014001000 drops but production still has.
  awk '/^create or replace function public.google_review_apply_reviews\(/ {on=1} on {print} on && /^\$\$;/ {exit}' \
    "$MIGRATIONS/20261013001000_google_reviews.sql" >"$ROOT/legacy_overload.sql"
  [ -s "$ROOT/legacy_overload.sql" ] || { echo "could not extract the legacy overload"; exit 1; }
  grep -q "p_complete boolean" "$ROOT/legacy_overload.sql"
  as_owner -1 -f "$ROOT/legacy_overload.sql" >/dev/null
  as_owner -c "revoke all on function public.google_review_apply_reviews(uuid, uuid, jsonb, boolean) from public, anon, authenticated; grant execute on function public.google_review_apply_reviews(uuid, uuid, jsonb, boolean) to service_role;"
  # The history the live database holds: every version up to 20261013001000, plus 20261014114127.
  admin -c "create schema if not exists supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text, created_by text, idempotency_key text, rollback text[]);"
  for f in "$MIGRATIONS"/*.sql; do
    v="$(version_of "$f")"; n="$(basename "$f" .sql)"; n="${n#*_}"
    if [ "$v" \< "20261014" ] || [ "$v" = "20261014114127" ]; then
      admin -c "insert into supabase_migrations.schema_migrations (version, name) values ('$v', '$n');"
    fi
  done
  [ "$(admin -At -c 'select count(*) from supabase_migrations.schema_migrations')" = "37" ] \
    || { echo "expected 37 history rows, got $(admin -At -c 'select count(*) from supabase_migrations.schema_migrations')"; exit 1; }
}

record_in_history() { admin -c "insert into supabase_migrations.schema_migrations (version, name) values ('$1', '$2') on conflict do nothing;"; }

apply_pending() {
  local limit="${1:-99999999999999}"
  for f in "$MIGRATIONS"/*.sql; do
    v="$(version_of "$f")"
    [ "$v" \> "$limit" ] && continue
    if [ "$(admin -At -c "select count(*) from supabase_migrations.schema_migrations where version = '$v'")" = "0" ]; then
      echo "   applying pending $(basename "$f")"
      apply_file "$f"
      # Tooling records what it applies.
      n="$(basename "$f" .sql)"; record_in_history "$v" "${n#*_}"
    fi
  done
}

diff_names() { { diff "$1" "$2" || true; } | { grep -E '^[<>]' || true; } | sed -E 's/^[<>] //; s/\|[^|]*$//' | LC_ALL=C sort -u; }

fail() { echo "PARITY CHECK FAILED: $*"; stop_cluster; exit 1; }

echo "== FRESH: every migration, in order"
new_cluster
apply_up_to "$CAPTURE"
# FRESH as it stands at the capture: what production's pre-capture state is compared with (step 1 below). Migrations AFTER the
# capture (for example the termination enforcement) are still pending on production, so they are not "differences" yet.
FRESH_CAP_FP="$(mktemp)"; fingerprint >"$FRESH_CAP_FP"
for f in "$MIGRATIONS"/*.sql; do
  [ "$(version_of "$f")" \> "$CAPTURE" ] || continue
  apply_file "$f"
done
FRESH_FP="$(mktemp)"; fingerprint >"$FRESH_FP"
echo "   $(wc -l <"$FRESH_FP") objects fingerprinted (full), $(wc -l <"$FRESH_CAP_FP") at the capture"

ALLOWED="$(mktemp)"
cat >"$ALLOWED" <<'LIST'
function|google_review_apply_reviews(p_run uuid, p_location uuid, p_reviews jsonb, p_complete boolean)
acl_fn|google_review_apply_reviews(p_run uuid, p_location uuid, p_reviews jsonb, p_complete boolean)
comment_fn|google_review_apply_reviews(p_run uuid, p_location uuid, p_reviews jsonb, p_complete boolean)
function|google_reviews_monthly(p_store_code text)
LIST
LC_ALL=C sort -o "$ALLOWED" "$ALLOWED"

SUNNY_PATTERN='employee_account_links_guard_update|auth_clear_user_credentials|app_user_audit_action_check|employee_account_links\.(managed_|service)|acl_col\|employee_account_links'

for scenario in A B; do
  echo
  echo "== PRODUCTION-like, scenario $scenario"
  new_cluster
  make_production_like
  P0="$(mktemp)"; fingerprint >"$P0"
  if [ "${PARITY_DUMP_PRODUCTION_LIKE:-}" != "" ]; then
    # Validation aid: dump the production-like fingerprint to the given file and leave it running.
    cp "$P0" "$PARITY_DUMP_PRODUCTION_LIKE"
    echo "   production-like fingerprint written to $PARITY_DUMP_PRODUCTION_LIKE; cluster left running on port $PORT"
    exit 0
  fi

  echo "   how PRODUCTION differs from FRESH (what the reconciliation will change):"
  diff_names "$P0" "$FRESH_CAP_FP" | sed 's/^/     - /'
  UNEXPECTED="$(diff_names "$P0" "$FRESH_CAP_FP" | LC_ALL=C comm -23 - "$ALLOWED" || true)"
  [ -z "$UNEXPECTED" ] || fail "production-like differs from fresh in more than the allow-listed objects: $UNEXPECTED"
  # The ONLY thing 'fresh' lacks is nothing: production's Ask Sunny objects exist in both once capture has run.

  if [ "$scenario" = "A" ]; then
    echo "   history: record 20261015001000 and 20261016001000 (metadata only; their objects already exist)"
    record_in_history 20261015001000 google_review_goals
    record_in_history 20261016001000 google_review_reporting_cutoff
  fi
  echo "   apply what is pending, up to and including the capture migration ($CAPTURE):"
  apply_pending "$CAPTURE"

  # The capture migration must not have touched the Ask Sunny-derived objects. Compared HERE, right after it, because a later
  # migration (for example the termination enforcement) may deliberately replace the guard.
  PC="$(mktemp)"; fingerprint >"$PC"
  # Guard against a vacuous pass: the pattern must actually match the objects (11 lines: the audit constraint, the guard function,
  # its trigger and privilege/comment lines, auth_clear_user_credentials and its lines, and the three column grants).
  [ "$(grep -cE "$SUNNY_PATTERN" "$P0")" -ge 11 ] || fail "the Ask Sunny-derived objects were not all found in the production-like database ($(grep -cE "$SUNNY_PATTERN" "$P0") of 11)"
  if ! diff <(grep -E "$SUNNY_PATTERN" "$P0") <(grep -E "$SUNNY_PATTERN" "$PC"); then
    fail "scenario $scenario: the capture changed an Ask Sunny-derived object"
  fi
  echo "   the Ask Sunny-derived objects are byte-for-byte unchanged by the capture"

  echo "   re-applying every migration from 20261014001000 up to the capture a SECOND time:"
  for f in "$MIGRATIONS"/*.sql; do
    v="$(version_of "$f")"
    { [ "$v" \< "20261014001000" ] || [ "$v" \> "$CAPTURE" ]; } && continue
    apply_file "$f"
  done
  P2="$(mktemp)"; fingerprint >"$P2"
  diff -q "$P2" "$PC" >/dev/null || { diff "$P2" "$PC" | head; fail "scenario $scenario: a second apply changed something"; }
  echo "   unchanged"

  echo "   apply anything later that is pending:"
  apply_pending

  P1="$(mktemp)"; fingerprint >"$P1"
  if ! diff -q "$P1" "$FRESH_FP" >/dev/null; then
    diff "$P1" "$FRESH_FP" | head -20
    fail "scenario $scenario does not converge to a fresh build"
  fi
  echo "   converged: identical to FRESH ($(wc -l <"$P1") objects)"

  admin -f "$REPO/supabase/tests/capture_live_objects_checks.sql" >"$ROOT/check.out" 2>&1 \
    || { cat "$ROOT/check.out"; fail "capture_live_objects_checks.sql on scenario $scenario"; }
  echo "   capture_live_objects_checks.sql passes"
done

stop_cluster
echo
echo "PRODUCTION PARITY: reconciliation proven on both scenarios"
