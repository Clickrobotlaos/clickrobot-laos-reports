import { SubstituteInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/**
 * POST /api/cr360/lessons/substitute — branch manager / CEO assigns or revokes a substitute teacher.
 * Authorisation, date rules and the audit row are all inside the 0010 database functions.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, SubstituteInput);
  if (!body.ok) return body.res;
  const sb = await supabaseServer();
  const b = body.data;
  const { data, error } = b.action === "assign"
    ? await sb.rpc("cr360_assign_substitute", { p_class: b.classId, p_user: b.userId, p_starts: b.startsOn, p_ends: b.endsOn, p_reason: b.reason })
    : await sb.rpc("cr360_revoke_substitute", { p_id: b.id, p_reason: b.reason ?? null });
  if (error) { const e = rpcErrorCode(error); return jsonError(e.status, e.code); }
  return jsonOk({ id: b.action === "assign" ? data : b.id, action: b.action }, b.action === "assign" ? 201 : 200);
}
