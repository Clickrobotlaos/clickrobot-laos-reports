/**
 * Teacher roll call over LEGACY attendance (pure, no I/O).
 * Legacy invariants this respects: UNIQUE(package_id, date) on attendance (one row per package per day,
 * so a package can never be debited twice in a day) and the attendance_apply_change trigger that keeps
 * student_packages.sessions_used in step with inserts/updates/deletes.
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
  /** Marked today for a DIFFERENT class (legacy allows one attendance row per package per day). */
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
    const a = attendance.find((x) => x.package_id === p.id && x.date === date);
    out.push({
      packageId: p.id,
      name: p.student_name,
      kind: b.kind,
      remaining: (p.sessions_total ?? 0) - (p.sessions_used ?? 0),
      status: a && (a.class_id === cls.id || a.class_id === null) ? (a.status as MarkStatus) : null,
      markedElsewhere: !!a && a.class_id !== null && a.class_id !== cls.id,
      recordedWithoutClass: !!a && a.class_id === null,
    });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

export type MarkPlan =
  | { op: "insert" }
  | { op: "update"; attendanceId: string }
  | { op: "noop" }
  | { op: "reject"; code: "not_booked" | "marked_elsewhere" | "no_balance" };

/**
 * Decide the write. Present on a package with no sessions left is refused (it would overdraw);
 * changing Present → Absent is always allowed (the legacy trigger gives the session back).
 */
export function planMark(entry: RosterEntry | undefined, existing: TodayAttendance | undefined, status: MarkStatus, classId: string): MarkPlan {
  if (!entry) return { op: "reject", code: "not_booked" };
  if (existing && existing.class_id !== null && existing.class_id !== classId) return { op: "reject", code: "marked_elsewhere" };
  if (existing && existing.status === status) return { op: "noop" };
  const debits = status === "Present" && existing?.status !== "Present";
  if (debits && entry.remaining <= 0) return { op: "reject", code: "no_balance" };
  return existing ? { op: "update", attendanceId: existing.id } : { op: "insert" };
}
