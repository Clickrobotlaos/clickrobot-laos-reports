/**
 * Teacher roll call over LEGACY attendance (pure, no I/O).
 * Owner decision C: a student may attend several classes on one day; each attended class debits one
 * session, never twice. Today's database still has UNIQUE(package_id, date); proposed 0011 replaces it
 * with one row per (package, class, day). This module works with both: a row for ANOTHER class is
 * informational, never a reason to refuse here; if the old constraint is still in place the insert
 * fails with 23505 and the API reports "marked_elsewhere". The legacy attendance_apply_change trigger
 * keeps student_packages.sessions_used in step with inserts/updates/deletes.
 */
import type { LegacyBooking, LegacyClass } from "./timetable";

export type MarkStatus = "Present" | "Absent";

export interface RosterPackage { id: string; student_name: string; sessions_total: number | null; sessions_used: number | null; active: boolean | null }
export interface TodayAttendance { id: string; package_id: string; class_id: string | null; status: string; date: string }

export interface RosterEntry {
  packageId: string;
  name: string;
  kind: "regular" | "makeup";
  remaining: number;
  status: MarkStatus | null;
  /** Also marked today for a DIFFERENT class (informational; allowed after 0011). */
  markedElsewhere: boolean;
  /** Today's row has no class (e.g. Records app Quick Scan). It is the same single record wherever shown. */
  recordedWithoutClass: boolean;
}

/** Who may take attendance for a class: its teacher or assistant, the branch manager, or the CEO. */
export function canTakeAttendance(cls: Pick<LegacyClass, "teacher_id" | "assistant_id" | "branch_id">, userId: string, opts: { isCeo: boolean; managerOf: string[] }): boolean {
  if (opts.isCeo) return true;
  if (cls.teacher_id === userId || cls.assistant_id === userId) return true;
  return opts.managerOf.includes(cls.branch_id);
}

export function roster(cls: LegacyClass, bookings: LegacyBooking[], packages: RosterPackage[], attendance: TodayAttendance[], date: string): RosterEntry[] {
  const byId = new Map(packages.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: RosterEntry[] = [];
  for (const b of bookings) {
    if (b.class_id !== cls.id || b.status !== "Confirmed") continue;
    if (b.kind === "makeup" && b.makeup_date !== date) continue;
    if (b.kind !== "regular" && b.kind !== "makeup") continue;
    if (seen.has(b.package_id)) continue;
    const p = byId.get(b.package_id);
    if (!p) continue;
    seen.add(b.package_id);
    const a = rowForClass(attendance, p.id, cls.id, date);
    const elsewhere = attendance.some((x) => x.package_id === p.id && x.date === date && x.class_id !== null && x.class_id !== cls.id);
    out.push({
      packageId: p.id,
      name: p.student_name,
      kind: b.kind,
      remaining: (p.sessions_total ?? 0) - (p.sessions_used ?? 0),
      status: a ? (a.status as MarkStatus) : null,
      markedElsewhere: elsewhere,
      recordedWithoutClass: !!a && a.class_id === null,
    });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

/** Today's record for THIS class: the class's own row, else a class-less (Quick Scan) row. */
export function rowForClass(attendance: TodayAttendance[], packageId: string, classId: string, date: string): TodayAttendance | undefined {
  const mine = attendance.filter((x) => x.package_id === packageId && x.date === date);
  return mine.find((x) => x.class_id === classId) ?? mine.find((x) => x.class_id === null);
}

export type MarkPlan =
  | { op: "insert" }
  | { op: "update"; attendanceId: string }
  | { op: "noop" }
  | { op: "reject"; code: "not_booked" | "no_balance" };

/**
 * Decide the write for `classId`. `existing` must be rowForClass(); another class's row is ignored. Present on a package with no sessions left is refused (it would overdraw);
 * changing Present → Absent is always allowed (the legacy trigger gives the session back).
 */
export function planMark(entry: RosterEntry | undefined, existing: TodayAttendance | undefined, status: MarkStatus, classId: string): MarkPlan {
  if (!entry) return { op: "reject", code: "not_booked" };
  if (existing && existing.class_id !== null && existing.class_id !== classId) existing = undefined; // another class's row
  if (existing && existing.status === status) return { op: "noop" };
  const debits = status === "Present" && existing?.status !== "Present";
  if (debits && entry.remaining <= 0) return { op: "reject", code: "no_balance" };
  return existing ? { op: "update", attendanceId: existing.id } : { op: "insert" };
}
