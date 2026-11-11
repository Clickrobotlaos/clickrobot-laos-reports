import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { hasRole, studentBranchScope } from "@/lib/cr360/access";
import { businessDate, dict } from "@/lib/cr360/i18n";
import { cashDifference, cashbookTotals, type ByCurrency, type CashLine } from "@/lib/cr360/cashbook";
import { Unauthorized } from "@/components/cr360/Blocks";
import { CashCountForm } from "@/components/cr360/BranchFinance";

export const dynamic = "force-dynamic";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fmt = (m: ByCurrency) => Object.entries(m).map(([c, v]) => `${v.toLocaleString()} ${c}`).join(" · ") || "0";

/** Daily cashbook for one branch: legacy income/expense lines, totals by method/currency, cash count. */
export default async function CashbookPage({ searchParams }: { searchParams: Promise<{ branch?: string; date?: string }> }) {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!ctx.viewer || !hasRole(ctx.viewer, ["ceo", "manager", "finance"])) return <Unauthorized t={t} />;
  const isCeo = hasRole(ctx.viewer, ["ceo"]);
  const sb = await supabaseServer();
  const { data: br } = await sb.from("branches").select("id,name").eq("active", true).order("name");
  const scope = studentBranchScope(ctx.viewer);
  const branches = ((br ?? []) as { id: string; name: string }[]).filter((b) => isCeo || scope === null || (scope ?? []).includes(b.id));
  const sp = await searchParams;
  const today = businessDate();
  const date = sp.date && ISO.test(sp.date) && sp.date <= today ? sp.date : today;
  const branch = branches.find((b) => sp.branch && UUID.test(sp.branch) && b.id === sp.branch) ?? branches[0];
  if (!branch) return <Unauthorized t={t} />;

  const [inc, exp, cnt] = await Promise.all([
    sb.from("income_records").select("id,receipt_no,payment_type,student_name,amount,currency,payment_method").eq("branch_id", branch.id).eq("date", date).order("created_at").limit(500),
    sb.from("expense_records").select("id,voucher_no,category,description,amount,currency,payment_method").eq("branch_id", branch.id).eq("date", date).order("created_at").limit(500),
    sb.from("cr360_cash_counts").select("id,counted,system_cash,note,counted_at").eq("branch_id", branch.id).eq("count_date", date).order("id", { ascending: false }).limit(5),
  ]);
  const income = (inc.data ?? []) as (CashLine & { id: string; receipt_no: string | null; payment_type: string | null; student_name: string | null })[];
  const expense = (exp.data ?? []) as (CashLine & { id: string; voucher_no: string | null; category: string; description: string | null })[];
  const tot = cashbookTotals(income, expense);
  const counts = (cnt.error ? [] : cnt.data ?? []) as { id: number; counted: ByCurrency; system_cash: ByCurrency; note: string | null; counted_at: string }[];
  const latest = counts[0];

  return (
    <>
      <Link href="/360" className="cr-muted">← {t.back}</Link>
      <h1 className="cr-h1" style={{ marginTop: 8 }}>📒 {t.cashbook}</h1>
      <form className="cr-row" method="get" style={{ alignItems: "end", gap: 8, marginBottom: 12 }}>
        <div className="cr-field"><label htmlFor="cb-b">{t.branch}</label>
          <select id="cb-b" name="branch" defaultValue={branch.id}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div className="cr-field"><label htmlFor="cb-d">{t.date}</label><input id="cb-d" name="date" type="date" defaultValue={date} max={today} /></div>
        <button className="cr-btn ghost" type="submit">OK</button>
      </form>
      <div className="cr-grid" style={{ gap: 14 }}>
        <section className="cr-card"><h2>{t.byMethod}</h2>
          {Object.keys(tot.byMethod).length === 0 ? <p className="cr-muted">{t.noLines}</p> : (
            <div className="cr-tablewrap"><table className="cr-table"><thead><tr><th scope="col"></th><th scope="col">{t.incomeLbl}</th><th scope="col">{t.expenseLbl}</th></tr></thead>
              <tbody>{Object.entries(tot.byMethod).map(([m, v]) => <tr key={m}><td>{m}</td><td>{fmt(v.in)}</td><td>{fmt(v.out)}</td></tr>)}</tbody></table></div>
          )}
          <p style={{ marginTop: 10 }}><b>{t.systemCash}:</b> {fmt(tot.systemCash)}</p>
        </section>
        <section className="cr-card"><h2>💵 {t.lastCount}</h2>
          {cnt.error ? <p className="cr-muted">{t.financeNotEnabled}</p> : (
            <>
              {latest ? (
                <p>{t.counted}: <b>{fmt(latest.counted)}</b><br />{t.systemCash}: {fmt(latest.system_cash)}<br />
                  {t.difference}: <b>{fmt(cashDifference(latest.counted, latest.system_cash))}</b>{latest.note ? <><br /><span className="cr-muted">{latest.note}</span></> : null}</p>
              ) : <p className="cr-muted">—</p>}
              <CashCountForm branchId={branch.id} date={date} hasCount={!!latest} t={t} />
            </>
          )}
        </section>
        <section className="cr-card"><h2>{t.incomeLbl} ({income.length})</h2>
          <ul className="cr-list">{income.map((r) => <li key={r.id}><span>{r.receipt_no ?? ""} {r.payment_type ?? ""}<br /><span className="cr-muted">{r.student_name ?? ""} · {r.payment_method ?? ""}</span></span><b>{Number(r.amount).toLocaleString()} {r.currency}</b></li>)}</ul>
        </section>
        <section className="cr-card"><h2>{t.expenseLbl} ({expense.length})</h2>
          <ul className="cr-list">{expense.map((r) => <li key={r.id}><span>{r.category}<br /><span className="cr-muted">{r.description ?? ""} · {r.payment_method ?? ""}</span></span><b>{Number(r.amount).toLocaleString()} {r.currency}</b></li>)}</ul>
        </section>
      </div>
    </>
  );
}
