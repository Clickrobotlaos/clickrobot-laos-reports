import { loadViewer } from "@/lib/cr360/viewer";
import { workspacesFor } from "@/lib/cr360/access";
import { jsonError, jsonOk } from "@/lib/cr360/api";

/** GET /api/cr360/me — identity + authorised workspaces. Never returns salary/bank fields. */
export async function GET() {
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, ctx.signedInWithoutMembership ? "no_membership" : "unauthenticated");
  return jsonOk({
    displayName: ctx.displayName,
    locale: ctx.locale,
    grants: ctx.viewer.grants.map((g) => ({ role: g.role, branchId: g.branchId })),
    workspaces: workspacesFor(ctx.viewer),
    employee: ctx.employee ? { id: ctx.employee.id, branchId: ctx.employee.branch_id, position: ctx.employee.position } : null,
  });
}
