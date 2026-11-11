import { ShiftCancelInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { requireShiftAdmin } from "@/lib/cr360/shift-admin";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody } from "@/lib/cr360/api";

/** POST /api/cr360/shifts/cancel — keeps the row as history; audited (migration 0008). */
export async function POST(req: Request) {
  const auth = await requireShiftAdmin(req);
  if (!auth.ok) return auth.res;
  const body = await parseBody(req, ShiftCancelInput);
  if (!body.ok) return body.res;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("cr360_hr_cancel_shift", { p_shift: body.data.shiftId, p_reason: body.data.reason });
  if (error) { const e = rpcErrorCode(error); return jsonError(e.status, e.code); }
  return jsonOk({ status: "cancelled" });
}
