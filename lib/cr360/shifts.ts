/**
 * Shift time helpers. Laos (Asia/Vientiane) is UTC+07:00 all year (no daylight saving), so wall-clock
 * input converts with a fixed offset. Overnight shifts must be flagged explicitly — never inferred.
 */
export const VIENTIANE_OFFSET = "+07:00";

export function vientianeToIso(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Invalid date/time");
  const iso = `${date}T${time}:00${VIENTIANE_OFFSET}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date/time");
  // Reject impossible calendar dates like 2026-02-30 (Date would roll them over).
  const local = new Date(d.getTime() + 7 * 3600e3).toISOString();
  if (local.slice(0, 10) !== date || local.slice(11, 16) !== time) throw new Error("Invalid date/time");
  return d.toISOString();
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Build the UTC range for a shift; `overnight` moves the end to the next day. */
export function shiftRange(args: { date: string; start: string; end: string; overnight: boolean }): { startsAt: string; endsAt: string } {
  const startsAt = vientianeToIso(args.date, args.start);
  const endsAt = vientianeToIso(args.overnight ? addDays(args.date, 1) : args.date, args.end);
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("End must be after start (tick 'ends next day' for overnight shifts)");
  return { startsAt, endsAt };
}
