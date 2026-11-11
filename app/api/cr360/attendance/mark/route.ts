import { MarkAttendanceInput } from "@/lib/cr360/schemas";
import { canTakeAttendance, planMark, roster } from "@/lib/cr360/rollcall";
import { dayOfWeek, type LegacyClass } from "@/lib/cr360/timetable";
import { hasRole, studentBranchScope } from "@/lib/cr360/access";
import { businessDate } from "@/lib/cr360/i18n";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { loadRollCallData } from "@/lib/cr360/legacy-rollcall";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/**
 * POST /api/cr360/attendance/mark — teacher roll call on the LEGACY attendance table, for TODAY only
 * (Vientiane business date, decided by the server). Works on today's database; no migration needed.
 * Double debit is impossible: legacy UNIQUE(package_id, date) + idempotent no-op + conditional update.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, MarkAttendanceInput);
  if (!body.ok) return body.res;
  const { classId, packageId, status } = body.data;
  const today = businessDate();

  const sb = await supabaseServer();
  const { data: cls } = await sb.from("classes")
    .select("id,name,program_id,branch_id,teacher_id,assistant_id,day_of_week,start_time,end_time,room,capacity,level,active")
    .eq("id", classId).eq("active", true).maybeSingle();
  if (!cls) return jsonError(404, "not_found");
  const scope = studentBranchScope(ctx.viewer);
  if (!canTakeAttendance(cls as LegacyClass, ctx.viewer.userId, { isCeo: hasRole(ctx.viewer, ["ceo"]), managerOf: scope ?? [] })) {
    return jsonError(404, "not_found"); // same answer as a missing class
  }
  if ((cls as LegacyClass).day_of_week !== dayOfWeek(today)) return jsonError(422, "not_today");

  const data = await loadRollCallData(sb, [classId], today);
  if (data.error) return jsonError(500, "server_error");
  const entry = roster(cls as LegacyClass, data.bookings, data.packages, data.attendance, today).find((e) => e.packageId === packageId);
  const existing = data.attendance.find((a) => a.package_id === packageId && a.date === today);
  const plan = planMark(entry, existing, status, classId);
  if (plan.op === "reject") return jsonError(plan.code === "not_booked" ? 404 : 409, plan.code);
  if (plan.op === "noop") return jsonOk({ status, changed: false });

  if (plan.op === "insert") {
    const { error } = await sb.from("attendance").insert({
      package_id: packageId, class_id: classId, date: today, status, recorded_by: ctx.viewer.userId, is_makeup: entry?.kind === "makeup",
    });
    if (error) {
      if (error.code === "23505") return jsonError(409, "already_decided"); // someone marked at the same moment
      return jsonError(error.code === "42501" ? 403 : 500, error.code === "42501" ? "forbidden" : "server_error");
    }
  } else {
    const { data: upd, error } = await sb.from("attendance").update({ status }).eq("id", plan.attendanceId).eq("status", existing!.status).select("id");
    if (error) return jsonError(error.code === "42501" ? 403 : 500, error.code === "42501" ? "forbidden" : "server_error");
    if (!upd || upd.length === 0) return jsonError(409, "already_decided");
  }
  return jsonOk({ status, changed: true }, 201);
}
