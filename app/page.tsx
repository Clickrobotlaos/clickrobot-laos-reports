"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid } from "recharts";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { CURRENCIES, fmt, money, todayStr, monthStr, PERMS } from "@/lib/util";

export default function HomePage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  return <Shell><Dashboard /></Shell>;
}

function Dashboard() {
  const app = useApp();
  const router = useRouter();
  const can = PERMS[app.role] || PERMS.viewer;
  const t = todayStr(), m = monthStr(), y = t.slice(0, 4);
  const cur = app.displayCurrency;
  const [income, setIncome] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [todayAtt, setTodayAtt] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const yearStart = `${y}-01-01`;
      const [i, e, s, r, p, pk, att] = await Promise.all([
        supabase.from("income_records").select("date,branch_id,program_id,amount,currency,amount_lak,unpaid_lak").gte("date", yearStart),
        supabase.from("expense_records").select("date,branch_id,category,amount_lak").gte("date", yearStart),
        supabase.from("student_records").select("date,branch_id,student_type,program_id").gte("date", yearStart),
        supabase.from("daily_reports").select("id,date,branch_id,status,submitted_by").gte("date", `${y}-01-01`),
        supabase.from("salary_payroll").select("month,status,net_lak").eq("month", m),
        supabase.from("student_packages").select("id,active,sessions_total,sessions_used,student_name,phone,branch_id,program_id").eq("active", true),
        supabase.from("attendance").select("id,status").eq("date", t),
      ]);
      setIncome(i.data || []); setExpenses(e.data || []);
      setStudents(s.data || []); setReports(r.data || []);
      setPayroll(p.data || []); setPackages(pk.data || []); setTodayAtt(att.data || []);
      setLoading(false);
    })();
  }, [y, m, t]);

  const sumLak = (rows: any[], filter: (r: any) => boolean, key = "amount_lak") =>
    rows.filter(filter).reduce((s, r) => s + (Number(r[key]) || 0), 0);

  const stats = {
    incToday: sumLak(income, (r) => r.date === t),
    incMonth: sumLak(income, (r) => r.date.startsWith(m)),
    incYear: sumLak(income, () => true),
    expToday: sumLak(expenses, (r) => r.date === t),
    expMonth: sumLak(expenses, (r) => r.date.startsWith(m)),
    expYear: sumLak(expenses, () => true),
    unpaid: income.reduce((s, r) => s + (Number(r.unpaid_lak) || 0), 0),
  };
  const net = stats.incMonth - stats.expMonth;
  const stuCount = (type: string) => students.filter((s) => s.student_type === type).length;
  const pendingReports = reports.filter((r) => r.status === "Submitted").length;
  const payPending = payroll.filter((p) => p.status === "Pending").length;
  const payPaidLak = payroll.filter((p) => p.status === "Paid").reduce((s, p) => s + (Number(p.net_lak) || 0), 0);

  const activePackages = packages.length;
  const lowBalance = packages.filter((p) => (p.sessions_total - p.sessions_used) > 0 && (p.sessions_total - p.sessions_used) <= 2).length;
  const presentToday = todayAtt.filter((a) => a.status === "Present").length;
  const absentToday = todayAtt.filter((a) => a.status === "Absent").length;

  const chartData = useMemo(() => {
    const out: any[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push({
        name: d.toLocaleString("en", { month: "short" }),
        Income: sumLak(income, (r) => r.date.startsWith(key)) / (app.rates[cur] || 1),
        Expenses: sumLak(expenses, (r) => r.date.startsWith(key)) / (app.rates[cur] || 1),
      });
    }
    return out;
  }, [income, expenses, cur, app.rates]);

  const pieData = app.programs.map((p) => ({
    name: p.name, value: students.filter((s) => s.program_id === p.id).length,
  })).filter((d) => d.value > 0);
  const PIE_COLORS = ["#2050C8", "#F5B920", "#17804C", "#C0392B"];

  const branchRows = app.branches.map((b) => ({
    branch: b.name,
    income: sumLak(income, (r) => r.branch_id === b.id && r.date.startsWith(m)),
    expenses: sumLak(expenses, (r) => r.branch_id === b.id && r.date.startsWith(m)),
    students: students.filter((s) => s.branch_id === b.id).length,
  }));

  const todayReportDone = reports.some((r) => r.date === t && r.status !== "Rejected");
  const M = (lak: number) => money(lak, cur, app.rates);

  return (
    <div>
      <div className="sectionhead">
        <h2>Dashboard</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="hint">Show in</span>
          <select style={{ width: "auto", padding: "8px 10px", fontSize: 13.5 }}
            value={cur} onChange={(e) => app.setDisplayCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {loading ? <div className="banner ok">Loading data…</div>
        : todayReportDone
          ? <div className="banner ok">✓ Today&apos;s daily report is in.</div>
          : <div className="banner warn">⏰ Today&apos;s daily report has not been submitted yet.</div>}

      {lowBalance > 0 && (
        <div className="banner warn" style={{ cursor: "pointer" }} onClick={() => router.push("/students")}>
          🔔 {lowBalance} student{lowBalance > 1 ? "s have" : " has"} 2 or fewer sessions left. Call for renewal.
        </div>
      )}

      <div className="cards">
        <div className="card ok"><span className="dot" /><div className="lbl">Income today</div><div className="val">{M(stats.incToday)}</div></div>
        <div className="card bad"><span className="dot" /><div className="lbl">Expenses today</div><div className="val">{M(stats.expToday)}</div></div>
        <div className="card ok"><div className="lbl">Income this month</div><div className="val">{M(stats.incMonth)}</div><div className="sub">Year: {M(stats.incYear)}</div></div>
        <div className="card bad"><div className="lbl">Expenses this month</div><div className="val">{M(stats.expMonth)}</div><div className="sub">Year: {M(stats.expYear)}</div></div>
        <div className={"card " + (net >= 0 ? "ok" : "bad")} style={{ display: can.netProfit ? undefined : "none" }}><div className="lbl">Net this month</div><div className="val">{M(net)}</div></div>
        <div className="card"><div className="lbl">Unpaid balance</div><div className="val">{M(stats.unpaid)}</div></div>
        <div className="card" onClick={() => router.push("/students")} style={{ cursor: "pointer" }}>
          <div className="lbl">Active students</div><div className="val">{activePackages}</div>
          <div className="sub">{lowBalance} low balance</div>
        </div>
        <div className="card" onClick={() => router.push("/attendance")} style={{ cursor: "pointer" }}>
          <div className="lbl">Attendance today</div>
          <div className="val" style={{ fontSize: 20 }}>
            <span style={{ color: "var(--ok)" }}>{presentToday}</span>
            <span style={{ color: "var(--ink2)", fontWeight: 400 }}> · </span>
            <span style={{ color: "var(--bad)" }}>{absentToday}</span>
          </div>
          <div className="sub">present · absent</div>
        </div>
        <div className="card"><div className="lbl">Pending approvals</div><div className="val">{pendingReports}</div><div className="sub">daily reports</div></div>
        <div className="card"><div className="lbl">Salary payout ({m})</div><div className="val">{M(payPaidLak)}</div><div className="sub">{payPending} pending</div></div>
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>Income vs expenses — last 6 months ({cur})</h3>
          <div style={{ width: "100%", height: 230 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ left: -10, right: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E7EE" />
                <XAxis dataKey="name" fontSize={12} tickLine={false} />
                <YAxis fontSize={11} tickLine={false} tickFormatter={(v) => v >= 1e6 ? (v / 1e6) + "M" : v >= 1e3 ? (v / 1e3) + "K" : v} />
                <Tooltip formatter={(v: any) => fmt(v, cur) + " " + cur} />
                <Bar dataKey="Income" fill="#2050C8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expenses" fill="#C0392B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel">
          <h3>Students by program</h3>
          <div style={{ width: "100%", height: 230 }}>
            {pieData.length ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % 4]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="empty">No student records yet.</div>}
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Branch performance — this month</h3>
        <div className="tblwrap">
          <table className="tbl"><thead><tr><th>Branch</th><th style={{textAlign:"right"}}>Income</th><th style={{textAlign:"right"}}>Expenses</th><th style={{textAlign:"right"}}>Net</th><th style={{textAlign:"right"}}>Students</th></tr></thead>
            <tbody>{branchRows.map((b) => (
              <tr key={b.branch}><td>{b.branch}</td><td className="num">{M(b.income)}</td><td className="num">{M(b.expenses)}</td>
                <td className="num" style={{ color: b.income - b.expenses >= 0 ? "var(--ok)" : "var(--bad)", fontWeight: 600 }}>{M(b.income - b.expenses)}</td>
                <td className="num">{b.students}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
