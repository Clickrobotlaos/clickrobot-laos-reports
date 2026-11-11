import { GuardianRequestInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/** POST /api/cr360/guardian-requests/create — parent request for a VERIFIED linked child (migration 0009). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, GuardianRequestInput);
  if (!body.ok) return body.res;
  // Pre-filter on the verified children loaded for this session; the DB re-checks the link.
  if (!(ctx.viewer.guardianOf ?? []).includes(body.data.studentCode)) return jsonError(404, "not_found");
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("cr360_guardian_request_create", {
    p_student_code: body.data.studentCode, p_kind: body.data.kind,
    p_start: body.data.startDate ?? null, p_end: body.data.endDate ?? null, p_message: body.data.message,
  });
  if (error) {
    if (error.code === "54000") return jsonError(429, "too_many");
    const e = rpcErrorCode(error); return jsonError(e.status, e.code);
  }
  return jsonOk({ status: "pending", id: data }, 201);
}
