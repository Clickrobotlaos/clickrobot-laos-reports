import { GuardianRevokeInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { requireGuardianAdmin } from "@/lib/cr360/guardian-admin";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody } from "@/lib/cr360/api";

/** POST /api/cr360/guardians/revoke — ends access immediately; history kept. */
export async function POST(req: Request) {
  const auth = await requireGuardianAdmin(req);
  if (!auth.ok) return auth.res;
  const body = await parseBody(req, GuardianRevokeInput);
  if (!body.ok) return body.res;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("cr360_guardian_revoke", { p_link: body.data.linkId, p_reason: body.data.reason });
  if (error) { const e = rpcErrorCode(error); return jsonError(e.status, e.code); }
  return jsonOk({ status: "revoked" });
}
