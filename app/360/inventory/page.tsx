import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { hasRole, studentBranchScope } from "@/lib/cr360/access";
import { dict } from "@/lib/cr360/i18n";
import { Unauthorized } from "@/components/cr360/Blocks";
import { ItemForm, StockMoveForm, type StockRow } from "@/components/cr360/Inventory";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stock per branch (0020). Staff view their branch; managers record movements; the CEO also manages items. */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!ctx.viewer || !ctx.viewer.grants.some((g) => g.active)) return <Unauthorized t={t} />;
  const isCeo = hasRole(ctx.viewer, ["ceo"]);
  const sb = await supabaseServer();
  const { data: br } = await sb.from("branches").select("id,name").eq("active", true).order("name");
  const all = (br ?? []) as { id: string; name: string }[];
  const mine = new Set(ctx.viewer.grants.filter((g) => g.active && g.branchId).map((g) => g.branchId as string));
  const visible = all.filter((b) => isCeo || mine.has(b.id));
  const want = (await searchParams).branch;
  const branch = visible.find((b) => want && UUID.test(want) && b.id === want) ?? visible[0];
  if (!branch) return <Unauthorized t={t} />;
  const st = await sb.rpc("cr360_inventory_stock", { p_branch: branch.id });
  const canMove = isCeo || (studentBranchScope(ctx.viewer) ?? []).includes(branch.id);
  const rows = (st.error ? [] : st.data ?? []) as StockRow[];
  return (
    <>
      <Link href="/360" className="cr-muted">← {t.back}</Link>
      <h1 className="cr-h1" style={{ marginTop: 8 }}>📦 {t.inventory}</h1>
      {visible.length > 1 && (
        <form method="get" className="cr-row" style={{ alignItems: "end", gap: 8, marginBottom: 12 }}>
          <div className="cr-field"><label htmlFor="iv-b">{t.branch}</label>
            <select id="iv-b" name="branch" defaultValue={branch.id}>{visible.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <button className="cr-btn ghost" type="submit">OK</button>
        </form>
      )}
      {st.error ? <div className="cr-banner info">{t.inventoryNotEnabled}</div> : (
        <div className="cr-grid" style={{ gap: 14 }}>
          <section className="cr-card"><h2>{branch.name}</h2>
            {rows.length === 0 ? <p className="cr-muted">{t.noItems}</p> : (
              <div className="cr-tablewrap"><table className="cr-table">
                <thead><tr><th scope="col">{t.item}</th><th scope="col">{t.category}</th><th scope="col">{t.onHand}</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.item_id}><td>{r.name} <span className="cr-muted">· {r.sku}</span></td><td>{t[`invc_${r.category as "kit"}`] ?? r.category}</td>
                    <td><b>{Number(r.on_hand)}</b> {r.unit}{Number(r.on_hand) <= r.reorder_level && r.reorder_level > 0 ? <span className="cr-badge pending" style={{ marginLeft: 6 }}>{t.lowStock}</span> : null}</td></tr>
                ))}</tbody></table></div>
            )}
          </section>
          {canMove && rows.length > 0 && <section className="cr-card"><h2>{t.recordMovement}</h2><StockMoveForm branchId={branch.id} items={rows} branches={all} t={t} /></section>}
          {isCeo && <section className="cr-card"><h2>{t.addItem}</h2><ItemForm t={t} /></section>}
        </div>
      )}
    </>
  );
}
