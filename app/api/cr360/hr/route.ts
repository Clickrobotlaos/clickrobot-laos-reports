import { HrAdminInput } from "@/lib/cr360/schemas";
import { hasRole } from "@/lib/cr360/access";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/** POST /api/cr360/hr — CEO only (checked here AND in the database functions). Every action is audited there. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  if (!hasRole(ctx.viewer, ["ceo"])) return jsonError(403, "forbidden");
  const body = await parseBody(req, HrAdminInput);
  if (!body.ok) return body.res;
  const b = body.data;
  const sb = await supabaseServer();
  const call = () => {
    switch (b.action) {
      case "grant_payroll": return sb.rpc("cr360_grant_payroll_access", { p_user: b.userId, p_reason: b.reason });
      case "revoke_payroll": return sb.rpc("cr360_revoke_payroll_access", { p_user: b.userId, p_reason: b.reason });
      case "suspend": return sb.rpc("cr360_staff_suspend", { p_user: b.userId, p_reason: b.reason });
      case "reinstate": return sb.rpc("cr360_staff_reinstate", { p_user: b.userId, p_reason: b.reason });
      case "offboard": return sb.rpc("cr360_staff_offboard", { p_user: b.userId, p_effective_date: b.effectiveDate, p_reason: b.reason });
    }
  };
  const r = await call();
  if (r.error) { const e = rpcErrorCode(r.error); return jsonError(e.status, e.code); }
  return jsonOk({ done: b.action });
}
