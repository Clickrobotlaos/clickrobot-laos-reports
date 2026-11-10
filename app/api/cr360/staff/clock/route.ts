import { ClockInput } from "@/lib/cr360/schemas";
import { clockErrorCode } from "@/lib/cr360/geo";
import { jsonError, jsonOk, parseBody, requireSelfEmployee } from "@/lib/cr360/api";

/**
 * POST /api/cr360/staff/clock
 * Calls the already-deployed RPC public.cr360_hr_clock AS THE USER. That function:
 *  - verifies auth.uid() owns the active employee row,
 *  - requires an enabled + approved site for the employee's branch (none are enabled yet),
 *  - checks accuracy ≤ 10 m and haversine distance ≤ radius,
 *  - serialises per employee and enforces in/out sequence,
 *  - stamps occurred_at with the SERVER clock (client time is never accepted).
 * A rejection never deducts wages; the UI offers a correction request.
 */
export async function POST(req: Request) {
  const auth = await requireSelfEmployee(req);
  if (!auth.ok) return auth.res;
  const body = await parseBody(req, ClockInput);
  if (!body.ok) return body.res;
  const b = body.data;

  // Note: client lat/lon/accuracy are passed only to the DB check and are not logged here.
  const { data, error } = await auth.sb.rpc("cr360_hr_clock", {
    p_employee: auth.employee.id,
    p_kind: b.action,
    p_lat: b.latitude,
    p_lon: b.longitude,
    p_accuracy: b.reportedAccuracyM,
  });
  if (error) {
    const code = clockErrorCode(error.message);
    return jsonError(code === "server_error" ? 500 : 422, code, { manualReviewAvailable: true });
  }
  const { data: punch } = await auth.sb
    .from("cr360_hr_attendance_events")
    .select("id,kind,occurred_at,distance_m,reported_accuracy_m")
    .eq("id", data as string)
    .maybeSingle();
  return jsonOk({ status: "accepted", reasonCode: "ok", punchId: data, serverTime: punch?.occurred_at ?? null }, 201);
}
