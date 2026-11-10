import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { canUseWorkspace } from "@/lib/cr360/access";
import { businessDate, dict } from "@/lib/cr360/i18n";
import { kip, monthBounds, summarise, type ExpenseRow, type IncomeRow, type InvoiceRow } from "@/lib/cr360/finance";
import { loadNames } from "@/lib/cr360/legacy-students";
import { Unauthorized, Planned } from "@/components/cr360/Blocks";
import { fetchAllPages } from "@/lib/cr360/paging";

export const dynamic = "force-dynamic";

/**
 * CEO / finance operational overview over legacy rows. Read-only, as the signed-in user.
 * Every number is a sum of stored rows for the selected month; nothing is estimated.
 */
export default async function FinancePage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!canUseWorkspace(ctx.viewer, "finance")) return <Unauthorized t={t} />;
  const today = businessDate();
  const raw = (await searchParams).m;
  let month = today.slice(0, 7), bounds = monthBounds(month);
  if (raw) { try { bounds = monthBounds(raw); month = raw; } catch { /* keep current month */ } }

  const sb = await supabaseServer();
  type R<T> = PromiseLike<{ data: T[] | null; error: unknown }>;
  // Paged: Supabase caps each response (1000 rows by default); a capped total would be silently wrong.
  const [inc, exp, inv, closed, names] = await Promise.all([
    fetchAllPages<IncomeRow>((f, t2) => sb.from("income_records").select("id,date,branch_id,amount,currency,rate_to_lak,amount_lak,unpaid_lak,payment_method").gte("date", bounds.start).lt("date", bounds.end).order("id").range(f, t2) as unknown as R<IncomeRow>),
    fetchAllPages<ExpenseRow>((f, t2) => sb.from("expense_records").select("id,date,branch_id,category,amount,currency,rate_to_lak,amount_lak").gte("date", bounds.start).lt("date", bounds.end).order("id").range(f, t2) as unknown as R<ExpenseRow>),
    fetchAllPages<InvoiceRow>((f, t2) => sb.from("invoices").select("id,branch_id,status,amount_lak,due_date,date").in("status", ["Draft", "Sent"]).order("id").range(f, t2) as unknown as R<InvoiceRow>),
    sb.from("closed_months").select("month").eq("month", month).maybeSingle(),
    loadNames(sb),
  ]);
  // Never show a partial total as if it were complete.
  const err = [inc, exp, inv].some((r) => r.error || r.truncated);
  const s = summarise({ income: inc.rows, expenses: exp.rows, invoices: inv.rows, today });
  const fmt = (c: bigint) => `${kip(c).toLocaleString("en-US")} LAK`;
  const bname = (b: string) => (b === "unassigned" ? t.unassigned : names.branch.get(b) ?? "—");
  const maxCat = s.expenseByCategory[0]?.lak ?? 0n;

  return (
    <>
      <h1 className="cr-h1">{t.ws_finance}</h1>
      <p className="cr-sub">{t.financeSub}</p>
      <div className="cr-banner warn" role="note">{t.notReconciled}</div>
      {err && <div className="cr-banner bad">{t.err_server_error}</div>}

      <form method="get" action="/360/finance" className="cr-form" style={{ maxWidth: 360 }}>
        <div className="cr-field"><label htmlFor="m">{t.month}</label>
          <div style={{ display: "flex", gap: 8 }}><input id="m" name="m" type="month" defaultValue={month} /><button className="cr-btn ghost" type="submit">→</button></div>
        </div>
      </form>
      <p className="cr-muted">{closed.data ? `🔒 ${t.monthClosed}` : t.monthOpen} · {month}</p>

      <section className="cr-kpis" aria-label={t.kpis}>
        <div className="cr-card cr-kpi"><div className="lbl">{t.income}</div><div className="val" style={{ fontSize: 22 }}>{fmt(s.incomeLak)}</div></div>
        <div className="cr-card cr-kpi"><div className="lbl">{t.expenses}</div><div className="val" style={{ fontSize: 22 }}>{fmt(s.expenseLak)}</div></div>
        <div className="cr-card cr-kpi"><div className="lbl">{t.netOperational}</div><div className="val" style={{ fontSize: 22, color: s.netLak < 0n ? "var(--c-bad)" : undefined }}>{fmt(s.netLak)}</div></div>
        <div className="cr-card cr-kpi"><div className="lbl">{t.openInvoices} ({s.openInvoices})</div><div className="val" style={{ fontSize: 22 }}>{fmt(s.openInvoicesLak)}</div></div>
        <div className="cr-card cr-kpi"><div className="lbl">{t.overdueInvoices} ({s.overdueInvoices})</div><div className="val" style={{ fontSize: 22, color: s.overdueInvoices ? "var(--c-warn)" : undefined }}>{fmt(s.overdueLak)}</div></div>
      </section>
      {s.unpaidLak > 0n && <p className="cr-muted">{t.unpaidRecorded}: {fmt(s.unpaidLak)}</p>}

      <div className="cr-grid c2" style={{ marginTop: 14 }}>
        <section className="cr-card" aria-labelledby="fb-h">
          <h2 id="fb-h">{t.byBranch}</h2>
          {s.byBranch.length === 0 ? <p className="cr-muted">—</p> : (
            <div className="cr-tablewrap"><table className="cr-table">
              <thead><tr><th scope="col">{t.colBranch}</th><th scope="col">{t.income}</th><th scope="col">{t.expenses}</th><th scope="col">{t.netOperational}</th></tr></thead>
              <tbody>{s.byBranch.map((b) => (
                <tr key={b.branch}><td>{bname(b.branch)}</td><td>{fmt(b.income)}</td><td>{fmt(b.expenses)}</td><td style={{ color: b.net < 0n ? "var(--c-bad)" : undefined }}>{fmt(b.net)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>

        <section className="cr-card" aria-labelledby="fc-h">
          <h2 id="fc-h">{t.byCategory}</h2>
          {s.expenseByCategory.length === 0 ? <p className="cr-muted">—</p> : (
            <ul className="cr-list">{s.expenseByCategory.map((c) => (
              <li key={c.key} style={{ display: "grid", gap: 4 }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>{c.key}</span><b>{fmt(c.lak)}</b></span>
                <div className="cr-fill" aria-hidden="true"><span style={{ width: `${maxCat > 0n ? Number((c.lak * 100n) / maxCat) : 0}%` }} /></div>
              </li>
            ))}</ul>
          )}
        </section>

        <section className="cr-card" aria-labelledby="fm-h">
          <h2 id="fm-h">{t.byMethod}</h2>
          {s.incomeByMethod.length === 0 ? <p className="cr-muted">—</p> : (
            <ul className="cr-list">{s.incomeByMethod.map((m) => <li key={m.key}><span>{m.key}</span><b>{fmt(m.lak)}</b></li>)}</ul>
          )}
          <h2 style={{ marginTop: 14 }}>{t.byCurrency}</h2>
          {s.incomeByCurrency.length === 0 ? <p className="cr-muted">—</p> : (
            <ul className="cr-list">{s.incomeByCurrency.map((c) => (
              <li key={c.key}><span>{c.key}</span><b>{(Number(c.lak) / 100).toLocaleString("en-US", { maximumFractionDigits: c.key === "LAK" ? 0 : 2 })} {c.key}</b></li>
            ))}</ul>
          )}
        </section>

        <section className="cr-card" aria-labelledby="dq-h">
          <h2 id="dq-h">{t.dataQuality}</h2>
          {s.dataQuality.incomeRateMismatch + s.dataQuality.expenseRateMismatch + s.dataQuality.unassignedBranch === 0 ? <p className="cr-muted">{t.dq_ok}</p> : (
            <ul className="cr-list">
              {s.dataQuality.incomeRateMismatch > 0 && <li><span>{t.income}: {t.dq_rate}</span><b>{s.dataQuality.incomeRateMismatch}</b></li>}
              {s.dataQuality.expenseRateMismatch > 0 && <li><span>{t.expenses}: {t.dq_rate}</span><b>{s.dataQuality.expenseRateMismatch}</b></li>}
              {s.dataQuality.unassignedBranch > 0 && <li><span>{t.dq_branch}</span><b>{s.dataQuality.unassignedBranch}</b></li>}
            </ul>
          )}
        </section>
      </div>

      <div className="cr-grid c2" style={{ marginTop: 14 }}>
        <Planned t={t} title="Reconciled ledger: invoices → payments → package credits" phase="Phase 1b"
          blockers={["Migration (not yet drafted): payments + allocations in minor units with rate snapshots, idempotent provider events"]} />
        <Planned t={t} title="Daily cashbook, close & executive finance" phase="Phase 4"
          blockers={["Branch-scoped finance grants", "Executive finance isolated (CEO / explicit partner grants only)"]} />
      </div>
    </>
  );
}
