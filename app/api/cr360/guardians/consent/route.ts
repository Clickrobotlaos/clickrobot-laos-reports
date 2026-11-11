import { GuardianConsentInput } from "@/lib/cr360/schemas";
import { guardianConsentVersion } from "@/lib/cr360/guardian-admin";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/**
 * POST /api/cr360/guardians/consent — a parent grants or withdraws an OPTIONAL consent for their own,
 * verified child (decision D). The database (0013) checks the link; the consent text version comes
 * from server config, never from the browser. Withdrawing always works; granting needs the version.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, GuardianConsentInput);
  if (!body.ok) return body.res;
  const { studentCode, purpose, granted } = body.data;
  const version = guardianConsentVersion();
  if (granted && !version) return jsonError(503, "consent_not_configured");
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("cr360_guardian_consent_set", { p_student_code: studentCode, p_purpose: purpose, p_granted: granted, p_version: granted ? version : null });
  if (error) { const e = rpcErrorCode(error); return jsonError(e.status === 422 ? 404 : e.status, e.status === 422 ? "not_found" : e.code); }
  return jsonOk({ purpose, granted, changed: data === true });
}
