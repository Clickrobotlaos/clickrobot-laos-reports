/** Attendance % = ended, non-cancelled shifts with a check-in inside [start-30min, end) ÷ ended shifts. */
export interface ShiftRow { id: string; starts_at: string; ends_at: string; status: string }
export interface PunchRow { kind: "in" | "out"; occurred_at: string }

export const EARLY_WINDOW_MS = 30 * 60 * 1000;

export function attendancePercent(shifts: ShiftRow[], punches: PunchRow[], now: Date): number | null {
  const ended = shifts.filter((s) => s.status !== "cancelled" && Date.parse(s.ends_at) <= now.getTime());
  if (ended.length === 0) return null;
  const ins = punches.filter((p) => p.kind === "in").map((p) => Date.parse(p.occurred_at));
  const attended = ended.filter((s) => {
    const a = Date.parse(s.starts_at) - EARLY_WINDOW_MS, b = Date.parse(s.ends_at);
    return ins.some((t) => t >= a && t < b);
  }).length;
  return Math.round((attended / ended.length) * 1000) / 10;
}
