import { BranchFinanceInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/** POST /api/cr360/finance/branch — expense requests, decisions, payment, cash count, manager limit. Rules in 0019. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, BranchFinanceInput);
  if (!body.ok) return body.res;
  const b = body.data;
  const sb = await supabaseServer();
  const call = () => {
    switch (b.action) {
      case "request": return sb.rpc("cr360_expense_request", { p_branch: b.branchId, p_category: b.category, p_description: b.description, p_supplier: b.supplier ?? null,
        p_amount: b.amount, p_currency: b.currency, p_rate: b.currency === "LAK" ? 1 : b.rate ?? null, p_needed_by: b.neededBy ?? null });
      case "approve": case "reject": case "cancel": return sb.rpc("cr360_expense_decide", { p_id: b.id, p_action: b.action, p_note: b.note ?? null });
      case "pay": return sb.rpc("cr360_expense_pay", { p_id: b.id, p_method: b.method, p_date: b.date });
      case "count": return sb.rpc("cr360_cash_count", { p_branch: b.branchId, p_day: b.date, p_counted: b.counted, p_note: b.note ?? null });
      case "limit": return sb.rpc("cr360_set_manager_expense_limit", { p_lak: b.lak });
    }
  };
  const r = await call();
  if (r.error) {
    const e = rpcErrorCode(r.error);
    const msg = (r.error.message ?? "").toLowerCase();
    if (msg.includes("needs ceo")) return jsonError(403, "needs_ceo");
    if (msg.includes("own request")) return jsonError(403, "own_request");
    if (msg.includes("closed")) return jsonError(409, "month_closed");
    return jsonError(e.status, e.code);
  }
  return jsonOk({ result: r.data }, b.action === "request" ? 201 : 200);
}
