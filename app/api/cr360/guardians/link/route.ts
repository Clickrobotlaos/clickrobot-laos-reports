import { GuardianLinkInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { requireGuardianAdmin } from "@/lib/cr360/guardian-admin";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody } from "@/lib/cr360/api";

/** POST /api/cr360/guardians/link — create a PENDING link (grants nothing until verified). Migration 0005. */
export async function POST(req: Request) {
  const auth = await requireGuardianAdmin(req);
  if (!auth.ok) return auth.res;
  const body = await parseBody(req, GuardianLinkInput);
  if (!body.ok) return body.res;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("cr360_guardian_link_by_email", {
    p_email: body.data.email, p_student_code: body.data.studentCode, p_relationship: body.data.relationship,
  });
  if (error) { const e = rpcErrorCode(error); return jsonError(e.status, e.code); }
  return jsonOk({ status: "pending", linkId: data }, 201);
}
