import { InventoryInput } from "@/lib/cr360/schemas";
import { rpcErrorCode } from "@/lib/cr360/rpc-errors";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { jsonError, jsonOk, parseBody, sameOrigin } from "@/lib/cr360/api";

/** POST /api/cr360/inventory — catalogue (CEO) and stock movements (branch manager / CEO). Rules in 0020. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "bad_origin");
  const ctx = await loadViewer();
  if (!ctx.viewer) return jsonError(401, "unauthenticated");
  const body = await parseBody(req, InventoryInput);
  if (!body.ok) return body.res;
  const b = body.data;
  const sb = await supabaseServer();
  const r = b.action === "item"
    ? await sb.rpc("cr360_inventory_item_save", { p_id: b.id ?? null, p_sku: b.sku, p_name: b.name, p_category: b.category, p_unit: b.unit, p_reorder: b.reorder, p_active: b.active ?? true })
    : await sb.rpc("cr360_inventory_move", {
        p_item: b.itemId, p_branch: b.branchId, p_kind: b.kind.startsWith("adjust") ? "adjust" : b.kind, p_qty: b.qty,
        p_note: b.note ?? null, p_to_branch: b.toBranchId ?? null, p_sign: b.kind === "adjust_down" ? -1 : 1 });
  if (r.error) {
    if (r.error.code === "23514") return jsonError(409, "not_enough_stock");
    if (r.error.code === "23505") return jsonError(409, "duplicate");
    const e = rpcErrorCode(r.error); return jsonError(e.status, e.code);
  }
  return jsonOk({ result: r.data });
}
