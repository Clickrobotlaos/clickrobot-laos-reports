import { GuardianRequestCancelInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/** POST /api/cr360/guardian-requests/cancel — a parent withdraws their own pending request (0009). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, GuardianRequestCancelInput);
  if (!body.ok) return body.res;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("cr360_guardian_request_cancel", { p_id: body.data.id });
  if (error) { const e = rpcErrorCode(error); return jsonError(e.status, e.code); }
  return jsonOk({ status: "cancelled" });
}
