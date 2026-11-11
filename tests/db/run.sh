#!/usr/bin/env bash
# Local, throwaway Postgres harness for the proposed migrations. NEVER touches Supabase.
#
#   1. builds a schema-only replica of production (tests/db/harness/10_legacy_schema.sql)
#      + the already-deployed v0.4 foundation + FICTIONAL fixtures
#   2. runs the staging RLS suite (supabase/tests/rls_negative_tests.sql)
#   3. BASELINE: asserts each audited vulnerability is reproducible on the production schema
#   4. applies 0001..0015 (twice, to prove idempotency) and asserts every vulnerability is closed
#      and every legacy workflow still works
#   5. applies the rollbacks 0015..0001, then re-applies forward and re-asserts
#
# Usage: bash tests/db/run.sh        (needs Postgres >= 15 binaries; PGBIN overrides location)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"; PORT="${PGPORT_TEST:-55432}"
RUN=(); if [ "$(id -u)" = "0" ]; then RUN=(runuser -u postgres --); chown postgres "$WORK"; fi

cleanup() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

"${RUN[@]}" "$PGBIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

psql_run() { "${RUN[@]}" "$PGBIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
step() { printf '\n== %s\n' "$1"; }
apply() { for f in "$@"; do psql_run -f "$f" >/dev/null; echo "   applied $(basename "$f")"; done; }
assert() { psql_run "$@" 2>&1 | grep -E 'PASS|FAIL|ERROR' | sed 's/^.*NOTICE:  /   /; s/^psql:.*ERROR:  /   ERROR: /'; }

H="$ROOT/tests/db/harness"; P="$ROOT/supabase/proposed"
FWD=("$P/0001_p0_hotfix_reset_and_role_escalation.sql" "$P/0002_confidential_users_and_shared_invoices.sql" "$P/0003_attendance_idempotency.sql" "$P/0004_hr_decisions_and_audit.sql" "$P/0005_guardian_links.sql" "$P/0006_legacy_reads_staff_only.sql" "$P/0007_atomic_invoice_payment.sql" "$P/0008_shift_planner.sql" "$P/0009_guardian_requests.sql" "$P/0010_lesson_logs_and_parent_reports.sql" "$P/0011_attendance_per_class.sql" "$P/0012_employment_lifecycle.sql" "$P/0013_guardian_consents.sql" "$P/0014_guardian_schedule_and_billing.sql" "$P/0015_achievements_and_certificates.sql")
RBK=("$P/0015_achievements_and_certificates.rollback.sql" "$P/0014_guardian_schedule_and_billing.rollback.sql" "$P/0013_guardian_consents.rollback.sql" "$P/0012_employment_lifecycle.rollback.sql" "$P/0011_attendance_per_class.rollback.sql" "$P/0010_lesson_logs_and_parent_reports.rollback.sql" "$P/0009_guardian_requests.rollback.sql" "$P/0008_shift_planner.rollback.sql" "$P/0007_atomic_invoice_payment.rollback.sql" "$P/0006_legacy_reads_staff_only.rollback.sql" "$P/0005_guardian_links.rollback.sql" "$P/0004_hr_decisions_and_audit.rollback.sql" "$P/0003_attendance_idempotency.rollback.sql" "$P/0002_confidential_users_and_shared_invoices.rollback.sql" "$P/0001_p0_hotfix_reset_and_role_escalation.rollback.sql")

step "build production-schema replica"
apply "$H/00_supabase_stubs.sql" "$H/10_legacy_schema.sql" "$H/20_cr360_v04_foundation.sql" "$H/21_staffos_phase3_deployed.sql" "$H/25_test_helpers.sql"

step "staging RLS suite (self-contained, rolls back)"
assert -f "$ROOT/supabase/tests/rls_negative_tests.sql"

apply "$H/30_fixtures.sql"

step "BASELINE — reproduce audited vulnerabilities on the production schema"
assert -v mode=baseline -f "$ROOT/tests/db/assert_legacy.sql"

step "apply proposed migrations 0001-0015 (twice: idempotency)"
apply "${FWD[@]}"; apply "${FWD[@]}"

step "FIXED — vulnerabilities closed, legacy workflows intact"
assert -v mode=fixed -f "$ROOT/tests/db/assert_legacy.sql"
assert -f "$ROOT/tests/db/assert_after_migrations.sql"
assert -f "$ROOT/tests/db/assert_guardians.sql"
assert -f "$ROOT/tests/db/assert_payments.sql"
assert -f "$ROOT/tests/db/assert_shifts.sql"
assert -f "$ROOT/tests/db/assert_guardian_requests.sql"
assert -f "$ROOT/tests/db/assert_lessons.sql"
assert -f "$ROOT/tests/db/assert_payroll_access.sql"
assert -f "$ROOT/tests/db/assert_attendance_per_class.sql"
assert -f "$ROOT/tests/db/assert_employment.sql"
assert -f "$ROOT/tests/db/assert_consents.sql"
assert -f "$ROOT/tests/db/assert_guardian_portal.sql"
assert -f "$ROOT/tests/db/assert_achievements.sql"

step "rollback 0015..0001, then re-apply forward"
apply "${RBK[@]}"; apply "${FWD[@]}"
assert -v mode=fixed -f "$ROOT/tests/db/assert_legacy.sql" | tail -1
assert -f "$ROOT/tests/db/assert_after_migrations.sql" | tail -1
assert -f "$ROOT/tests/db/assert_guardians.sql" | tail -1
assert -f "$ROOT/tests/db/assert_payments.sql" | tail -1
assert -f "$ROOT/tests/db/assert_shifts.sql" | tail -1
assert -f "$ROOT/tests/db/assert_guardian_requests.sql" | tail -1
assert -f "$ROOT/tests/db/assert_lessons.sql" | tail -1
assert -f "$ROOT/tests/db/assert_payroll_access.sql" | tail -1
assert -f "$ROOT/tests/db/assert_attendance_per_class.sql" | tail -1
assert -f "$ROOT/tests/db/assert_employment.sql" | tail -1
assert -f "$ROOT/tests/db/assert_consents.sql" | tail -1
assert -f "$ROOT/tests/db/assert_guardian_portal.sql" | tail -1
assert -f "$ROOT/tests/db/assert_achievements.sql" | tail -1
echo; echo "ALL DATABASE HARNESS CHECKS PASSED"
