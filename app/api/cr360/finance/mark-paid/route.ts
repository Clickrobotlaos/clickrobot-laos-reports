import { MarkPaidInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { canUseWorkspace } from "@/lib/cr360/access";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/**
 * POST /api/cr360/finance/mark-paid — atomic, idempotent full payment of a legacy invoice via
 * public.cr360_mark_invoice_paid (proposed migration 0007). The DB function re-checks the legacy role,
 * closed months and invoice state. Returns 501 not_enabled until 0007 is applied.
 * No money moves: this RECORDS a payment the centre has already received.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  if (!canUseWorkspace(ctx.viewer, "finance")) return jsonError(403, "forbidden");
  const body = await parseBody(req, MarkPaidInput);
  if (!body.ok) return body.res;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("cr360_mark_invoice_paid", { p_invoice: body.data.invoiceId, p_method: body.data.method });
  if (error) { const e = rpcErrorCode(error); return jsonError(e.status, e.code); }
  const r = (data ?? {}) as { already_paid?: boolean; income_id?: string };
  return jsonOk({ status: "paid", alreadyPaid: !!r.already_paid, incomeId: r.income_id ?? null });
}
