/**
 * GPS punch pre-check. A GEOMETRIC SIGNAL ONLY — client coordinates and accuracy can be spoofed.
 * The authoritative check runs in the deployed DB function public.cr360_hr_clock,
 * which uses the server clock and the approved site row. Sites are disabled until a branch
 * admin physically verifies the entrance; coordinates are never guessed from map links.
 */
export const DEFAULT_RADIUS_M = 10;
export const MAX_ACCURACY_M = 10;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  for (const v of [lat1, lon1, lat2, lon2]) if (!Number.isFinite(v)) throw new Error("Invalid coordinate");
  if ([lat1, lat2].some((x) => Math.abs(x) > 90) || [lon1, lon2].some((x) => Math.abs(x) > 180)) throw new Error("Out-of-range coordinate");
  const r = 6371000, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export type PunchPrecheck = "site_disabled" | "low_accuracy" | "outside_zone" | "ok_pending_server";

export function precheckPunch(args: {
  site: { latitude: number; longitude: number; radiusM: number; enabled: boolean; approved: boolean } | null;
  latitude: number; longitude: number; accuracyM: number;
}): { result: PunchPrecheck; distanceM?: number } {
  const s = args.site;
  if (!s || !s.enabled || !s.approved) return { result: "site_disabled" };
  if (!Number.isFinite(args.accuracyM) || args.accuracyM <= 0 || args.accuracyM > MAX_ACCURACY_M) return { result: "low_accuracy" };
  const d = haversineMeters(s.latitude, s.longitude, args.latitude, args.longitude);
  if (d > Math.min(s.radiusM, DEFAULT_RADIUS_M)) return { result: "outside_zone", distanceM: d };
  return { result: "ok_pending_server", distanceM: d };
}

/** Map DB errors from cr360_hr_clock to stable, non-punitive reason codes. */
export function clockErrorCode(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("accuracy")) return "low_accuracy";
  if (m.includes("site not approved")) return "site_disabled";
  if (m.includes("outside designated zone")) return "outside_zone";
  if (m.includes("sequence")) return "sequence_invalid";
  if (m.includes("access denied")) return "not_employee";
  if (m.includes("authentication")) return "unauthenticated";
  return "server_error";
}
