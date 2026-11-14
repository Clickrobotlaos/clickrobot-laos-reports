import { BudgetInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/** POST /api/cr360/finance/budget — CEO sets one category budget for a branch and month (0022, audited). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, BudgetInput);
  if (!body.ok) return body.res;
  const b = body.data;
  const sb = await supabaseServer();
  const r = await sb.rpc("cr360_budget_set", { p_branch: b.branchId, p_month: `${b.month}-01`, p_category: b.category, p_amount: b.amount });
  if (r.error) { const e = rpcErrorCode(r.error); return jsonError(e.status, e.code); }
  return jsonOk({ amount: r.data });
}
