import { ShiftCreateInput } from "@/lib/cr360/schemas";
import { shiftRange } from "@/lib/cr360/shifts";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { requireShiftAdmin } from "@/lib/cr360/shift-admin";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody } from "@/lib/cr360/api";

/** POST /api/cr360/shifts/create — Vientiane wall-clock input → audited DB function (migration 0008). */
export async function POST(req: Request) {
  const auth = await requireShiftAdmin(req);
  if (!auth.ok) return auth.res;
  const body = await parseBody(req, ShiftCreateInput);
  if (!body.ok) return body.res;
  let range;
  try { range = shiftRange({ ...body.data, overnight: body.data.overnight ?? false }); } catch { return jsonError(400, "validation"); }
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("cr360_hr_create_shift", { p_employee: body.data.employeeId, p_starts: range.startsAt, p_ends: range.endsAt });
  if (error) { const e = rpcErrorCode(error); return jsonError(e.status, e.code); }
  return jsonOk({ status: "scheduled", shiftId: data, ...range }, 201);
}
