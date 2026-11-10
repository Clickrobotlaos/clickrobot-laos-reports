import { LeadActionInput } from "@/lib/cr360/schemas";
import { planLeadAction } from "@/lib/cr360/crm";
import { canUseWorkspace, studentBranchScope } from "@/lib/cr360/access";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/**
 * POST /api/cr360/crm/lead-action — safe stage moves on legacy leads, as the signed-in user (legacy RLS
 * still applies). Branch scope is enforced here (legacy RLS is not branch-aware); leads with no branch
 * are CEO-only. Optimistic concurrency: the UPDATE is conditional on the status the user saw.
 * The activity row is written after the update (same two-step pattern as the legacy leads page).
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  if (!canUseWorkspace(ctx.viewer, "crm")) return jsonError(403, "forbidden");
  const body = await parseBody(req, LeadActionInput);
  if (!body.ok) return body.res;
  const { leadId, action, expectedStatus, reason } = body.data;

  const sb = await supabaseServer();
  const scope = studentBranchScope(ctx.viewer);
  let q = sb.from("leads").select("id,status,branch_id").eq("id", leadId);
  if (scope !== null) q = q.in("branch_id", scope.length ? scope : ["00000000-0000-0000-0000-000000000000"]);
  const { data: lead } = await q.maybeSingle();
  if (!lead) return jsonError(404, "not_found"); // same answer for other-branch and missing

  if (lead.status !== expectedStatus) return jsonError(409, "already_decided");
  const plan = planLeadAction(lead, action, new Date().toISOString(), reason);
  if (!plan.ok) return jsonError(plan.code === "reason_required" ? 400 : 422, plan.code === "reason_required" ? "validation" : plan.code);

  const { data: updated, error } = await sb.from("leads").update(plan.patch).eq("id", leadId).eq("status", expectedStatus).select("id,status");
  if (error) return jsonError(error.code === "42501" ? 403 : 500, error.code === "42501" ? "forbidden" : "server_error");
  if (!updated || updated.length === 0) return jsonError(409, "already_decided");

  const { error: actErr } = await sb.from("lead_activities").insert({
    lead_id: leadId, action: plan.activity.action, note: plan.activity.note, by_user: ctx.viewer.userId, by_name: ctx.displayName,
  });
  return jsonOk({ status: updated[0].status, activityLogged: !actErr });
}
