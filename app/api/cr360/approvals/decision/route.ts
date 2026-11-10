import { DecisionInput } from "@/lib/cr360/schemas";
import { decisionErrorCode } from "@/lib/cr360/decision-errors";
import { hasRole } from "@/lib/cr360/access";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/**
 * POST /api/cr360/approvals/decision — approve/reject a pending leave / OT / correction request.
 * The DB function (migration 0004) is the authority: branch scope, no self-approval, single decision,
 * append-only audit. This route only pre-filters obvious non-reviewers and maps errors.
 * Returns 501 not_enabled until 0004 has been approved and applied.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, ctx.signedInWithoutMembership ? "no_membership" : "unauthenticated");
  if (!hasRole(ctx.viewer, ["ceo", "hr", "manager"])) return jsonError(403, "forbidden");
  const body = await parseBody(req, DecisionInput);
  if (!body.ok) return body.res;

  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("cr360_hr_decide_request", {
    p_kind: body.data.kind, p_id: body.data.id, p_action: body.data.action, p_reason: body.data.reason ?? null,
  });
  if (error) {
    const e = decisionErrorCode(error);
    return jsonError(e.status, e.code);
  }
  return jsonOk({ status: data, id: body.data.id });
}
