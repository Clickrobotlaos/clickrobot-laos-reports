#!/usr/bin/env bash
# Verify a production BACKUP can be restored, and rehearse the proposed migrations on that copy.
# Runs on a throwaway LOCAL Postgres; never connects to Supabase; deletes the copy when done.
#
#   bash tests/db/restore-check.sh /path/to/backup.sql            # plain SQL dump (pg_dump / supabase db dump)
#   REHEARSE=1 bash tests/db/restore-check.sh /path/to/backup.sql # also apply 0001..0013 + rollbacks on the copy
#
# The dump contains real personal data: keep it on an encrypted disk, never commit it, delete it after.
set -euo pipefail
DUMP="${1:?usage: restore-check.sh <dump.sql>}"
[ -r "$DUMP" ] || { echo "cannot read $DUMP"; exit 2; }
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"; PORT="${PGPORT_TEST:-55433}"
cp "$DUMP" "$WORK/dump.sql"; chmod 600 "$WORK/dump.sql"   # private copy, deleted on exit
RUN=(); if [ "$(id -u)" = "0" ]; then RUN=(runuser -u postgres --); chown -R postgres "$WORK"; fi
cleanup() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
"${RUN[@]}" "$PGBIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null
q() { PGOPTIONS="-c client_min_messages=warning" "${RUN[@]}" "$PGBIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "== Supabase roles/schemas stubs (auth, storage, roles) for a plain restore"
q -f "$ROOT/tests/db/harness/00_supabase_stubs.sql" >/dev/null
echo "== restore $(basename "$DUMP")"
# Errors about Supabase-internal objects (extensions, publications, owners) are expected on plain Postgres;
# they are counted and listed, the data tables must still load.
q -v ON_ERROR_STOP=0 -f "$WORK/dump.sql" > "$WORK/restore.log" 2>&1 || true
if grep -q "psql: error" "$WORK/restore.log"; then cat "$WORK/restore.log"; echo "RESTORE FAILED: dump could not be read"; exit 1; fi
echo "   restore messages with ERROR: $(grep -c ERROR "$WORK/restore.log" || true) (see list below if any)"
grep ERROR "$WORK/restore.log" | sort | uniq -c | sort -rn | head -15 || true

SNAP="select 'users' t, count(*) from public.users union all select 'branches', count(*) from public.branches
 union all select 'student_packages', count(*) from public.student_packages union all select 'attendance', count(*) from public.attendance
 union all select 'invoices', count(*) from public.invoices union all select 'income_records', count(*) from public.income_records
 union all select 'salary_payroll', count(*) from public.salary_payroll union all select 'leads', count(*) from public.leads
 union all select 'class_bookings', count(*) from public.class_bookings union all select 'classes', count(*) from public.classes
 union all select 'sessions_used_sum', coalesce(sum(sessions_used),0) from public.student_packages order by 1"
echo "== row counts in the restored copy (compare with the counts taken just before the backup)"
q -c "$SNAP" | tee "$WORK/before.txt"

if [ "${REHEARSE:-0}" = "1" ]; then
  P="$ROOT/supabase/proposed"
  echo "== rehearsal: apply 0001..0013 on the restored copy"
  for f in $(ls "$P"/0*.sql | grep -v rollback | sort); do q -f "$f" >/dev/null && echo "   applied $(basename "$f")"; done
  q -c "$SNAP" > "$WORK/after.txt"
  if diff -q "$WORK/before.txt" "$WORK/after.txt" >/dev/null; then echo "   PASS row counts and session totals unchanged by the migrations"; else echo "   FAIL counts changed:"; diff "$WORK/before.txt" "$WORK/after.txt"; exit 1; fi
  echo "== rehearsal: rollbacks 0013..0001"
  for f in $(ls "$P"/0*.rollback.sql | sort -r); do q -f "$f" >/dev/null && echo "   rolled back $(basename "$f" .rollback.sql)"; done
  q -c "$SNAP" > "$WORK/after_rb.txt"
  diff -q "$WORK/before.txt" "$WORK/after_rb.txt" >/dev/null && echo "   PASS row counts unchanged after rollback" || { echo "   FAIL after rollback"; exit 1; }
fi
echo; echo "RESTORE CHECK FINISHED (local copy deleted on exit)"
