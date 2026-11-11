/**
 * Teaching indicators per teacher for a period (pure, no I/O). Owner request 2026-11-11.
 * Indicators, not a score: they help a manager see where support is needed. They do not account for
 * public holidays, cancelled sessions or substitutes, so a low number is a question, never a verdict.
 *
 *  scheduled  class-days from the timetable (active classes, weekday match, period start..until)
 *  rollCall   scheduled class-days with at least one attendance row for that class
 *  logged     scheduled class-days with a lesson log (0010)
 *  reports    approved parent reports / student notes written on those logs (0010)
 */
import { dayOfWeek, type LegacyClass } from "./timetable";

export interface KpiAttendance { class_id: string | null; date: string }
export interface KpiLog { id: string; class_id: string; lesson_date: string }
export interface KpiNote { lesson_log_id: string; status: string }

export interface TeacherKpi {
  teacherId: string;
  scheduled: number;
  rollCall: number;
  logged: number;
  notes: number;
  approved: number;
  /** 0–100, null when nothing was scheduled */
  rollCallPct: number | null;
  loggedPct: number | null;
  approvedPct: number | null;
}

export function datesBetween(from: string, until: string): string[] {
  const out: string[] = [];
  const d = new Date(from + "T00:00:00Z"), end = new Date(until + "T00:00:00Z");
  for (; d <= end && out.length < 400; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : null);

export function teachingKpis(
  classes: Pick<LegacyClass, "id" | "teacher_id" | "day_of_week" | "active">[],
  attendance: KpiAttendance[], logs: KpiLog[], notes: KpiNote[], from: string, until: string,
): TeacherKpi[] {
  const days = datesBetween(from, until);
  const took = new Set(attendance.filter((a) => a.class_id).map((a) => `${a.class_id}|${a.date}`));
  const logByKey = new Map(logs.map((l) => [`${l.class_id}|${l.lesson_date}`, l.id]));
  const notesByLog = new Map<string, KpiNote[]>();
  for (const n of notes) notesByLog.set(n.lesson_log_id, [...(notesByLog.get(n.lesson_log_id) ?? []), n]);

  const byTeacher = new Map<string, TeacherKpi>();
  for (const c of classes) {
    if (!c.active || !c.teacher_id || c.day_of_week === null || c.day_of_week === undefined) continue;
    const k = byTeacher.get(c.teacher_id) ?? { teacherId: c.teacher_id, scheduled: 0, rollCall: 0, logged: 0, notes: 0, approved: 0, rollCallPct: null, loggedPct: null, approvedPct: null };
    for (const d of days) {
      if (dayOfWeek(d) !== c.day_of_week) continue;
      const key = `${c.id}|${d}`;
      k.scheduled++;
      if (took.has(key)) k.rollCall++;
      const logId = logByKey.get(key);
      if (logId) {
        k.logged++;
        const ns = notesByLog.get(logId) ?? [];
        k.notes += ns.length;
        k.approved += ns.filter((n) => n.status === "approved").length;
      }
    }
    byTeacher.set(c.teacher_id, k);
  }
  return [...byTeacher.values()].map((k) => ({ ...k, rollCallPct: pct(k.rollCall, k.scheduled), loggedPct: pct(k.logged, k.scheduled), approvedPct: pct(k.approved, k.notes) }));
}
