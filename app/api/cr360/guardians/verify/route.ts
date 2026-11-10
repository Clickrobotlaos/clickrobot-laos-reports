import { GuardianVerifyInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { guardianConsentVersion, requireGuardianAdmin } from "@/lib/cr360/guardian-admin";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody } from "@/lib/cr360/api";

/**
 * POST /api/cr360/guardians/verify — manager confirms identity in person and that the parent accepted
 * the consent text. The consent version comes from SERVER config, never from the client.
 */
export async function POST(req: Request) {
  const auth = await requireGuardianAdmin(req);
  if (!auth.ok) return auth.res;
  const version = guardianConsentVersion();
  if (!version) return jsonError(503, "consent_not_configured");
  const body = await parseBody(req, GuardianVerifyInput);
  if (!body.ok) return body.res;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("cr360_guardian_verify", { p_link: body.data.linkId, p_consent_version: version });
  if (error) { const e = rpcErrorCode(error); return jsonError(e.status, e.code); }
  return jsonOk({ status: "verified", consentVersion: version });
}
