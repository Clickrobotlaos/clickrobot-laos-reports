/**
 * Timetable, occupancy and conflict rules over LEGACY classes/class_bookings (pure, no I/O).
 * Occupancy mirrors the legacy DB trigger check_class_capacity exactly:
 *   seats used on date D = confirmed regular bookings + confirmed makeup bookings with makeup_date = D.
 * Legacy day_of_week: 0 = Sunday … 6 = Saturday. Times are local (Asia/Vientiane) wall-clock.
 */
export interface LegacyClass {
  id: string;
  name: string;
  program_id: string | null;
  branch_id: string;
  teacher_id: string | null;
  assistant_id: string | null;
  day_of_week: number | null;
  start_time: string | null; // "HH:MM:SS"
  end_time: string | null;
  room: string | null;
  capacity: number | null;
  level: string | null;
  active: boolean;
}

export interface LegacyBooking {
  id: string;
  class_id: string;
  package_id: string;
  kind: "regular" | "makeup" | string;
  makeup_date: string | null;
  status: string;
}

/** Display order Monday → Sunday. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function minutes(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v < 24 * 60 ? v : null;
}

export function dayOfWeek(isoDate: string): number {
  // isoDate is a business date (YYYY-MM-DD); compute weekday without timezone drift.
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export interface Occupancy { regular: number; makeup: number; used: number; capacity: number | null; free: number | null; full: boolean; over: boolean }

export function occupancy(cls: LegacyClass, bookings: LegacyBooking[], date: string): Occupancy {
  const mine = bookings.filter((b) => b.class_id === cls.id && b.status === "Confirmed");
  const regular = mine.filter((b) => b.kind === "regular").length;
  const makeup = mine.filter((b) => b.kind === "makeup" && b.makeup_date === date).length;
  const used = regular + makeup;
  const cap = cls.capacity && cls.capacity > 0 ? cls.capacity : null; // legacy: null/0 = unlimited
  return { regular, makeup, used, capacity: cap, free: cap === null ? null : cap - used, full: cap !== null && used >= cap, over: cap !== null && used > cap };
}

export function weekGrid(classes: LegacyClass[]) {
  const active = classes.filter((c) => c.active && c.day_of_week !== null);
  return WEEK_ORDER.map((d) => ({
    day: d,
    classes: active.filter((c) => c.day_of_week === d)
      .sort((a, b) => (minutes(a.start_time) ?? 0) - (minutes(b.start_time) ?? 0) || a.name.localeCompare(b.name)),
  }));
}

export interface Conflict { kind: "teacher" | "room"; a: string; b: string; day: number; who: string }

function overlaps(a: LegacyClass, b: LegacyClass): boolean {
  const as = minutes(a.start_time), ae = minutes(a.end_time), bs = minutes(b.start_time), be = minutes(b.end_time);
  if (as === null || ae === null || bs === null || be === null) return false;
  return as < be && bs < ae; // half-open: back-to-back is fine
}

/**
 * Teacher overlaps across ALL branches (a teacher cannot be in two centres at once) and room overlaps
 * within a branch. Assistants count as teachers for overlap purposes.
 */
export function findConflicts(classes: LegacyClass[]): Conflict[] {
  const act = classes.filter((c) => c.active && c.day_of_week !== null);
  const out: Conflict[] = [];
  for (let i = 0; i < act.length; i++) {
    for (let j = i + 1; j < act.length; j++) {
      const a = act[i], b = act[j];
      if (a.day_of_week !== b.day_of_week || !overlaps(a, b)) continue;
      const staffA = [a.teacher_id, a.assistant_id].filter(Boolean) as string[];
      const staffB = new Set([b.teacher_id, b.assistant_id].filter(Boolean) as string[]);
      for (const s of staffA) if (staffB.has(s)) out.push({ kind: "teacher", a: a.id, b: b.id, day: a.day_of_week!, who: s });
      const ra = a.room?.trim().toLowerCase(), rb = b.room?.trim().toLowerCase();
      if (ra && ra === rb && a.branch_id === b.branch_id) out.push({ kind: "room", a: a.id, b: b.id, day: a.day_of_week!, who: a.room!.trim() });
    }
  }
  return out;
}

/** Seat grid for the 2.5D classroom view: near-square layout, filled seats first. */
export function seatGrid(capacity: number | null, used: number): { cols: number; seats: ("filled" | "free" | "over")[] } {
  const cap = capacity ?? Math.max(used, 1);
  const n = Math.max(cap, used);
  const cols = Math.max(2, Math.ceil(Math.sqrt(n)));
  const seats = Array.from({ length: n }, (_, i) => (i < Math.min(used, cap) ? "filled" : i < cap ? "free" : "over") as "filled" | "free" | "over");
  return { cols, seats };
}
