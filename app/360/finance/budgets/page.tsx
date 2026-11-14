import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { hasRole, studentBranchScope } from "@/lib/cr360/access";
import { businessDate, dict } from "@/lib/cr360/i18n";
import { Unauthorized } from "@/components/cr360/Blocks";
import { BudgetEditor } from "@/components/cr360/BudgetEditor";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Budget vs actual vs committed per category (0022). CEO edits; managers and finance view. */
export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ branch?: string; month?: string }> }) {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!ctx.viewer || !hasRole(ctx.viewer, ["ceo", "manager", "finance"])) return <Unauthorized t={t} />;
  const isCeo = hasRole(ctx.viewer, ["ceo"]);
  const sb = await supabaseServer();
  const { data: br } = await sb.from("branches").select("id,name").eq("active", true).order("name");
  const scope = studentBranchScope(ctx.viewer);
  const branches = ((br ?? []) as { id: string; name: string }[]).filter((b) => isCeo || scope === null || (scope ?? []).includes(b.id));
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : businessDate().slice(0, 7);
  const branch = branches.find((b) => sp.branch && UUID.test(sp.branch) && b.id === sp.branch) ?? branches[0];
  if (!branch) return <Unauthorized t={t} />;
  const rep = await sb.rpc("cr360_budget_report", { p_branch: branch.id, p_month: `${month}-01` });
  const rows = (rep.error ? [] : rep.data ?? []) as { category: string; budget_lak: number | null; actual_lak: number; committed_lak: number; remaining_lak: number | null }[];
  const n = (v: number | null) => (v === null ? "—" : Number(v).toLocaleString());
  return (
    <>
      <Link href="/360/finance" className="cr-muted">← {t.back}</Link>
      <h1 className="cr-h1" style={{ marginTop: 8 }}>🎯 {t.budgets}</h1>
      <p className="cr-sub">{t.budgetsNote}</p>
      <form method="get" className="cr-row" style={{ alignItems: "end", gap: 8, marginBottom: 12 }}>
        <div className="cr-field"><label htmlFor="bu-b">{t.branch}</label><select id="bu-b" name="branch" defaultValue={branch.id}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div className="cr-field"><label htmlFor="bu-m">{t.monthLbl}</label><input id="bu-m" name="month" type="month" defaultValue={month} /></div>
        <button className="cr-btn ghost" type="submit">OK</button>
      </form>
      {rep.error ? <div className="cr-banner info">{t.budgetsNotEnabled}</div> : (
        <section className="cr-card"><div className="cr-tablewrap"><table className="cr-table">
          <thead><tr><th scope="col">{t.category}</th><th scope="col">{t.budgetLak}</th><th scope="col">{t.actualLbl}</th><th scope="col">{t.committedLbl}</th><th scope="col">{t.remainingLbl}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.category}>
              <td>{r.category}</td>
              <td>{isCeo ? <BudgetEditor branchId={branch.id} month={month} category={r.category} current={r.budget_lak === null ? null : Number(r.budget_lak)} t={t} /> : n(r.budget_lak)}</td>
              <td>{n(r.actual_lak)}</td><td>{n(r.committed_lak)}</td>
              <td>{r.remaining_lak === null ? "—" : <span className={`cr-badge ${Number(r.remaining_lak) < 0 ? "rejected" : "approved"}`}>{n(r.remaining_lak)}</span>}</td>
            </tr>
          ))}</tbody>
        </table></div></section>
      )}
    </>
  );
}
