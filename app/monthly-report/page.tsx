"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { CURRENCIES, fmt, money, monthStr, PERMS } from "@/lib/util";

export default function MonthlyReportPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  const can = PERMS[app.role] || PERMS.viewer;
  if (!can.monthlyReport) {
    return <Shell><div className="panel"><div className="empty">This page is available to CEO / Admin only.</div></div></Shell>;
  }
  return <Shell><MonthlyReportView /></Shell>;
}

function MonthlyReportView() {
  const app = useApp();
  const router = useRouter();
  const search = useSearchParams();
  const [month, setMonth] = useState(search?.get("month") || monthStr());
  const [cur, setCur] = useState(app.displayCurrency);
  const [data, setData] = useState<any>(null);
  const [company, setCompany] = useState<any>({ name: "ClickRobot Laos" });
  const [loading, setLoading] = useState(true);
  const [closed, setClosed] = useState<any | null>(null);

  useEffect(() => { (async () => {
    setLoading(true);
    const start = `${month}-01`;
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

    const [inc, exp, stu, rep, pay, comp, cl] = await Promise.all([
      supabase.from("income_records").select("*").gte("date", start).lt("date", end),
      supabase.from("expense_records").select("*").gte("date", start).lt("date", end),
      supabase.from("student_records").select("*").gte("date", start).lt("date", end),
      supabase.from("daily_reports").select("*").gte("date", start).lt("date", end).order("date"),
      supabase.from("salary_payroll").select("*").eq("month", month),
      supabase.from("settings").select("value").eq("key", "company").maybeSingle(),
      supabase.from("closed_months").select("*").eq("month", month).maybeSingle(),
    ]);
    setData({ inc: inc.data || [], exp: exp.data || [], stu: stu.data || [], rep: rep.data || [], pay: pay.data || [] });
    if (comp.data?.value) setCompany({ ...company, ...comp.data.value });
    setClosed(cl.data);
    setLoading(false);
  })(); /* eslint-disable-next-line */ }, [month]);

  if (loading || !data) return <div className="panel"><div className="empty">Loading report…</div></div>;

  const M = (lak: number) => money(lak, cur, app.rates);
  const sum = (rows: any[], key = "amount_lak") => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);

  const totalIncome = sum(data.inc);
  const totalExpenses = sum(data.exp);
  const netProfit = totalIncome - totalExpenses;
  const unpaid = data.inc.reduce((s: number, r: any) => s + (Number(r.unpaid_lak) || 0), 0);

  const perProgram = app.programs.map((p) => ({
    name: p.name,
    income: sum(data.inc.filter((r: any) => r.program_id === p.id)),
    students: data.stu.filter((r: any) => r.program_id === p.id).length,
    newS: data.stu.filter((r: any) => r.program_id === p.id && r.student_type === "New").length,
    ext: data.stu.filter((r: any) => r.program_id === p.id && r.student_type === "Extension").length,
    trial: data.stu.filter((r: any) => r.program_id === p.id && r.student_type === "Trial").length,
    conv: data.stu.filter((r: any) => r.program_id === p.id && r.student_type === "Trial Converted").length,
  }));

  const perBranch = app.branches.map((b) => ({
    name: b.name,
    income: sum(data.inc.filter((r: any) => r.branch_id === b.id)),
    expenses: sum(data.exp.filter((r: any) => r.branch_id === b.id)),
    students: data.stu.filter((r: any) => r.branch_id === b.id).length,
  }));

  const perExpenseCat: Record<string, number> = {};
  data.exp.forEach((r: any) => {
    perExpenseCat[r.category] = (perExpenseCat[r.category] || 0) + (Number(r.amount_lak) || 0);
  });

  const payPaid = data.pay.filter((r: any) => r.status === "Paid").reduce((s: number, r: any) => s + (Number(r.net_lak) || 0), 0);

  const monthLabel = new Date(month + "-15").toLocaleString("en", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="noprint" style={{ marginBottom: 12 }}>
        <button className="btn sm ghost" onClick={() => router.push("/reports")}>← Back to reports</button>
      </div>

      <div className="panel noprint">
        <div className="frow c3">
          <div className="field">
            <label>Month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div className="field">
            <label>Show in</label>
            <select value={cur} onChange={(e) => setCur(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <button className="btn" onClick={() => window.print()}>🖨 Print / Save as PDF</button>
          </div>
        </div>
        {closed && <div className="banner ok" style={{ marginTop: 12 }}>✓ This month was closed on {new Date(closed.closed_at).toLocaleDateString()}. Data is locked.</div>}
      </div>

      <div className="report-doc">
        <style>{`
          .report-doc{background:#fff;border:1px solid #ddd;border-radius:12px;padding:32px 34px;max-width:820px;margin:14px auto;color:#111}
          .report-doc h1{font-size:24px;margin:0}
          .report-doc h2{font-size:14px;color:#5A6478;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-top:22px;margin-bottom:8px;border-bottom:1px solid #E3E7EE;padding-bottom:6px}
          .report-doc .muted{color:#666;font-size:13px}
          .report-doc .head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap;border-bottom:2px solid #182136;padding-bottom:14px}
          .report-doc table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:6px}
          .report-doc th{text-align:left;padding:8px 10px;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:#5A6478;border-bottom:1px solid #E3E7EE;background:#F8FAFD}
          .report-doc td{padding:8px 10px;border-bottom:1px solid #f0f0f0;vertical-align:top}
          .report-doc td.num{text-align:right;font-variant-numeric:tabular-nums}
          .report-doc .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}
          .report-doc .cell{background:#F5F7FB;border:1px solid #E3E7EE;border-radius:8px;padding:10px 12px}
          .report-doc .cell .k{font-size:11px;color:#5A6478;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
          .report-doc .cell .v{font-family:'Space Grotesk',sans-serif;font-size:17px;font-weight:700;margin-top:4px}
          .report-doc .cell.ok .v{color:#17804C} .report-doc .cell.bad .v{color:#C0392B}
          .report-doc .foot{margin-top:26px;color:#666;font-size:12px;text-align:center;border-top:1px solid #eee;padding-top:12px}
          @media print{
            body *{visibility:hidden!important}
            .report-doc,.report-doc *{visibility:visible!important}
            .noprint{display:none!important}
            .report-doc{border:none;box-shadow:none;margin:0;max-width:none;padding:16px 20px}
          }
        `}</style>

        <div className="head">
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            {company.logo_url && (
              <img src={company.logo_url} alt=""
                   style={{ width: 60, height: 60, borderRadius: 10, objectFit: "cover" }}
                   onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )}
            <div>
              <h1>{company.name || "ClickRobot Laos"}</h1>
              <div className="muted">
                {company.address && <>{company.address}<br /></>}
                {company.phone && <>Phone: {company.phone} · </>}
                {company.email}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>Monthly Report</div>
            <div className="muted">{monthLabel}</div>
            <div className="muted">Generated: {new Date().toLocaleDateString()}</div>
          </div>
        </div>

        <h2>Financial summary</h2>
        <div className="summary">
          <div className="cell ok"><div className="k">Total income</div><div className="v">{M(totalIncome)}</div></div>
          <div className="cell bad"><div className="k">Total expenses</div><div className="v">{M(totalExpenses)}</div></div>
          <div className={"cell " + (netProfit >= 0 ? "ok" : "bad")}><div className="k">Net profit</div><div className="v">{M(netProfit)}</div></div>
          <div className="cell"><div className="k">Unpaid balance</div><div className="v">{M(unpaid)}</div></div>
        </div>

        <h2>Income by program</h2>
        <table>
          <thead><tr><th>Program</th><th style={{ textAlign: "right" }}>Students</th><th style={{ textAlign: "right" }}>New/Ext/Trial/Conv</th><th style={{ textAlign: "right" }}>Income</th></tr></thead>
          <tbody>{perProgram.map((p) => (
            <tr key={p.name}><td>{p.name}</td>
              <td className="num">{p.students}</td>
              <td className="num">{p.newS} / {p.ext} / {p.trial} / {p.conv}</td>
              <td className="num">{M(p.income)}</td></tr>
          ))}</tbody>
        </table>

        <h2>Performance by branch</h2>
        <table>
          <thead><tr><th>Branch</th><th style={{ textAlign: "right" }}>Income</th><th style={{ textAlign: "right" }}>Expenses</th><th style={{ textAlign: "right" }}>Net</th><th style={{ textAlign: "right" }}>Students</th></tr></thead>
          <tbody>{perBranch.map((b) => (
            <tr key={b.name}><td>{b.name}</td>
              <td className="num">{M(b.income)}</td>
              <td className="num">{M(b.expenses)}</td>
              <td className="num" style={{ color: b.income - b.expenses >= 0 ? "#17804C" : "#C0392B", fontWeight: 700 }}>{M(b.income - b.expenses)}</td>
              <td className="num">{b.students}</td></tr>
          ))}</tbody>
        </table>

        <h2>Expenses by category</h2>
        <table>
          <thead><tr><th>Category</th><th style={{ textAlign: "right" }}>Amount</th><th style={{ textAlign: "right" }}>% of total</th></tr></thead>
          <tbody>{Object.entries(perExpenseCat).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([cat, amt]) => (
            <tr key={cat}><td>{cat}</td><td className="num">{M(amt as number)}</td>
              <td className="num">{totalExpenses ? Math.round(((amt as number) / totalExpenses) * 100) + "%" : "—"}</td></tr>
          ))}
          {Object.keys(perExpenseCat).length === 0 && <tr><td colSpan={3} style={{ color: "#666", padding: 14, textAlign: "center" }}>No expenses in this month.</td></tr>}
          </tbody>
        </table>

        <h2>Salary payout</h2>
        <table>
          <thead><tr><th>Staff</th><th>Position</th><th>Status</th><th style={{ textAlign: "right" }}>Net (LAK)</th></tr></thead>
          <tbody>
            {data.pay.map((p: any) => (
              <tr key={p.id}><td>{p.staff_name}</td><td>{p.position || "—"}</td><td>{p.status}</td><td className="num">{fmt(p.net_lak)}</td></tr>
            ))}
            {data.pay.length === 0 && <tr><td colSpan={4} style={{ color: "#666", padding: 14, textAlign: "center" }}>No salary records for this month.</td></tr>}
            {data.pay.length > 0 && (
              <tr><td colSpan={3} style={{ fontWeight: 700, textAlign: "right" }}>Total paid</td><td className="num" style={{ fontWeight: 700 }}>{fmt(payPaid)} LAK</td></tr>
            )}
          </tbody>
        </table>

        <h2>Daily reports</h2>
        <table>
          <thead><tr><th>Date</th><th>Branch</th><th style={{ textAlign: "right" }}>Income</th><th style={{ textAlign: "right" }}>Expenses</th><th>Status</th></tr></thead>
          <tbody>{data.rep.map((r: any) => {
            const b = app.branches.find((x) => x.id === r.branch_id)?.name || "";
            return (<tr key={r.id}><td>{r.date}</td><td>{b}</td>
              <td className="num">{fmt(r.total_income)} LAK</td>
              <td className="num">{fmt(r.total_expenses)} LAK</td>
              <td>{r.status}</td></tr>);
          })}
          {data.rep.length === 0 && <tr><td colSpan={5} style={{ color: "#666", padding: 14, textAlign: "center" }}>No daily reports for this month.</td></tr>}
          </tbody>
        </table>

        <div className="foot">
          {company.name || "ClickRobot Laos"} · Monthly report for {monthLabel} · Generated by ClickRobot Report &amp; Record System
        </div>
      </div>
    </div>
  );
}
