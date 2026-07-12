"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field } from "@/components/ui";
import { PERMS, fmt, todayStr, monthStr, emptyProgramStats, copyText } from "@/lib/util";

export default function ReportsPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  const can = PERMS[app.role] || PERMS.viewer;
  if (!can.approve && app.role !== "admin" && app.role !== "co_admin") {
    return <Shell><div className="panel"><div className="empty">You don&apos;t have permission to view this page. Contact your administrator.</div></div></Shell>;
  }
  return <Shell><ReportsView /></Shell>;
}

function ReportsView() {
  const app = useApp();
  const router = useRouter();
  const can = PERMS[app.role];
  const [mode, setMode] = useState<"list" | "new" | "detail" | "revise">("list");
  const [sel, setSel] = useState<any | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMonthly, setShowMonthly] = useState(false);

  async function reload() {
    setLoading(true);
    const { data } = await supabase.from("daily_reports").select("*").order("date", { ascending: false }).limit(200);
    setReports(data || []); setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  const branchName = (id: string) => app.branches.find((b) => b.id === id)?.name || "";

  async function updateStatus(id: string, status: string, note?: string) {
    const patch: any = { status, reviewed_by: app.userId, reviewed_at: new Date().toISOString() };
    if (note !== undefined) patch.review_note = note;
    const { error } = await supabase.from("daily_reports").update(patch).eq("id", id);
    if (error) { alert(error.message); return; }
    reload();
    if (sel) setSel({ ...sel, ...patch });
  }

  if (mode === "new") return <ReportForm onDone={() => { setMode("list"); reload(); }} onCancel={() => setMode("list")} />;
  if (mode === "revise" && sel) return <ReportForm existing={sel} onDone={() => { setMode("list"); reload(); }} onCancel={() => setMode("list")} />;

  if (mode === "detail" && sel) {
    const rep = reports.find((r) => r.id === sel.id) || sel;
    return (
      <div>
        <button className="btn sm ghost" onClick={() => setMode("list")}>← Back to reports</button>
        <div className="panel">
          <h3>Daily report — {rep.date} · {branchName(rep.branch_id)} <span className={"pill " + rep.status}>{rep.status}</span></h3>
          {rep.review_note && rep.status === "Rejected" && (
            <div className="banner bad" style={{ marginTop: 10 }}><b>Reason for rejection:</b>&nbsp;{rep.review_note}</div>
          )}
          <div className="tblwrap" style={{ marginTop: 10 }}>
            <table className="tbl"><tbody>
              <tr><td>Opening cash</td><td className="num">{fmt(rep.opening_cash)} LAK</td></tr>
              <tr><td>Total income</td><td className="num">{fmt(rep.total_income)} LAK</td></tr>
              <tr><td>Total expenses</td><td className="num">{fmt(rep.total_expenses)} LAK</td></tr>
              <tr><td><b>Net cash</b></td><td className="num"><b>{fmt(rep.net_cash)} LAK</b></td></tr>
              <tr><td>Unpaid balance</td><td className="num">{fmt(rep.unpaid)} LAK</td></tr>
              {rep.notes && <tr><td>Notes</td><td>{rep.notes}</td></tr>}
            </tbody></table>
          </div>
          {can.approve && rep.status === "Submitted" && (
            <div className="btnrow">
              <button className="btn ok" onClick={() => updateStatus(rep.id, "Approved", "")}>Approve</button>
              <button className="btn bad" onClick={() => {
                const reason = window.prompt("Reason for rejection (required — staff will see this):");
                if (reason && reason.trim()) updateStatus(rep.id, "Rejected", reason.trim());
              }}>Reject</button>
            </div>
          )}
          {rep.status === "Rejected" && can.submit && (
            <div className="btnrow">
              <button className="btn" onClick={() => { setSel(rep); setMode("revise"); }}>Revise & resubmit</button>
            </div>
          )}
          {rep.status === "Approved" && <div className="hint" style={{ marginTop: 10 }}>This report is approved and locked.</div>}
        </div>

        <div className="panel">
          <h3>WhatsApp report</h3>
          <WhatsAppMessage rep={rep} branchLabel={branchName(rep.branch_id)} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="sectionhead">
        <h2>Daily reports</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {can.monthlyReport && <button className="btn sm ghost" onClick={() => router.push("/monthly-report")}>📄 Monthly report (PDF)</button>}
          <button className="btn sm ghost" onClick={() => setShowMonthly(!showMonthly)}>{showMonthly ? "Hide" : "Monthly"} WhatsApp summary</button>
          {can.submit && <button className="btn sm" onClick={() => setMode("new")}>+ New report</button>}
        </div>
      </div>

      {showMonthly && <MonthlySummary />}

      {loading ? <div className="panel"><div className="empty">Loading…</div></div>
        : reports.length === 0 ? <div className="panel"><div className="empty">No reports yet.</div></div>
          : (
            <div className="tblwrap"><table className="tbl">
              <thead><tr><th>Date</th><th>Branch</th><th style={{ textAlign: "right" }}>Income</th>
                <th style={{ textAlign: "right" }}>Expenses</th><th style={{ textAlign: "right" }}>Net</th>
                <th>Status</th><th></th></tr></thead>
              <tbody>{reports.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td><td>{branchName(r.branch_id)}</td>
                  <td className="num">{fmt(r.total_income)} LAK</td>
                  <td className="num">{fmt(r.total_expenses)} LAK</td>
                  <td className="num">{fmt(r.net_cash)} LAK</td>
                  <td><span className={"pill " + r.status}>{r.status}</span></td>
                  <td><button className="btn sm ghost" onClick={() => { setSel(r); setMode("detail"); }}>Open</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
    </div>
  );
}

function ReportForm({ existing, onDone, onCancel }: { existing?: any; onDone: () => void; onCancel: () => void }) {
  const app = useApp();
  const [f, setF] = useState<any>(existing ? { ...existing } : {
    date: todayStr(), branch_id: app.branchId || app.branches[0]?.id || "",
    opening_cash: "", total_income: "", total_expenses: "", unpaid: "", notes: "",
    program_stats: emptyProgramStats(app.programs.map((p) => p.name)),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const net = (Number(f.opening_cash) || 0) + (Number(f.total_income) || 0) - (Number(f.total_expenses) || 0);
  const setPS = (p: string, k: string, v: string) => setF({
    ...f, program_stats: { ...f.program_stats, [p]: { ...(f.program_stats?.[p] || {}), [k]: Number(v) || 0 } },
  });

  async function save(status: "Draft" | "Submitted") {
    setBusy(true); setErr("");
    const payload: any = {
      date: f.date, branch_id: f.branch_id, submitted_by: app.userId,
      opening_cash: Number(f.opening_cash) || 0,
      total_income: Number(f.total_income) || 0,
      total_expenses: Number(f.total_expenses) || 0,
      net_cash: net, unpaid: Number(f.unpaid) || 0,
      notes: f.notes || null, program_stats: f.program_stats, status,
    };
    let result;
    if (existing?.id) {
      result = await supabase.from("daily_reports").update({ ...payload, review_note: null }).eq("id", existing.id);
    } else {
      result = await supabase.from("daily_reports").insert(payload);
    }
    setBusy(false);
    if (result.error) { setErr(result.error.message); return; }
    onDone();
  }

  return (
    <div className="panel">
      <h3>{existing ? "Revise daily report" : "New daily report"}</h3>
      <div className="frow c3">
        <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Branch">
          <select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
            {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Submitted by"><input value={app.userName} disabled /></Field>
      </div>
      <div className="frow c2">
        <Field label="Opening cash (LAK)"><input type="number" inputMode="numeric" value={f.opening_cash} onChange={(e) => setF({ ...f, opening_cash: e.target.value })} placeholder="0" /></Field>
        <Field label="Unpaid balance (LAK)"><input type="number" inputMode="numeric" value={f.unpaid} onChange={(e) => setF({ ...f, unpaid: e.target.value })} placeholder="0" /></Field>
        <Field label="Total income (LAK)"><input type="number" inputMode="numeric" value={f.total_income} onChange={(e) => setF({ ...f, total_income: e.target.value })} placeholder="0" /></Field>
        <Field label="Total expenses (LAK)"><input type="number" inputMode="numeric" value={f.total_expenses} onChange={(e) => setF({ ...f, total_expenses: e.target.value })} placeholder="0" /></Field>
      </div>
      <div className="lakbox">Net cash = {fmt(net)} LAK</div>

      <h3 style={{ margin: "18px 0 4px" }}>Students today</h3>
      {app.programs.map((p) => (
        <div key={p.id} style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{p.name}</div>
          <div className="frow" style={{ gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {[["newS", "New"], ["ext", "Extension"], ["trial", "Trial"], ["conv", "Converted"]].map(([k, lbl]) => (
              <Field key={k} label={lbl}>
                <input type="number" inputMode="numeric" min="0" value={f.program_stats?.[p.name]?.[k] ?? 0} onChange={(e) => setPS(p.name, k, e.target.value)} />
              </Field>
            ))}
          </div>
        </div>
      ))}

      <div className="frow" style={{ marginTop: 12 }}>
        <Field label="Notes"><textarea rows={2} value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      {err && <div className="banner bad">{err}</div>}
      <div className="btnrow">
        <button className="btn" disabled={busy || !f.branch_id} onClick={() => save("Submitted")}>{busy ? "Saving…" : "Submit report"}</button>
        {!existing && <button className="btn ghost" disabled={busy} onClick={() => save("Draft")}>Save draft</button>}
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function buildDailyMessage(rep: any, branchLabel: string, programs: string[]) {
  const ps = rep.program_stats || {};
  const block = (p: string) => {
    const s = ps[p] || { newS: 0, ext: 0, trial: 0, conv: 0 };
    return `${p}\nNew: ${s.newS || 0}\nExtension: ${s.ext || 0}\nTrial: ${s.trial || 0}\nTrial Converted: ${s.conv || 0}`;
  };
  return `ClickRobot Laos Daily Report

Date: ${rep.date}
Branch: ${branchLabel}

Financial Summary:
Total Income: ${fmt(rep.total_income)} LAK
Total Expenses: ${fmt(rep.total_expenses)} LAK
Net Cash: ${fmt(rep.net_cash)} LAK
Unpaid Balance: ${fmt(rep.unpaid)} LAK

Student Summary:

${programs.map(block).join("\n\n")}

Notes: ${rep.notes || "-"}
Status: ${rep.status}`;
}

function WhatsAppMessage({ rep, branchLabel }: { rep: any; branchLabel: string }) {
  const app = useApp();
  const [copied, setCopied] = useState(false);
  const [recipients, setRecipients] = useState<any[]>([]);
  const text = buildDailyMessage(rep, branchLabel, app.programs.map((p) => p.name));
  useEffect(() => {
    supabase.from("whatsapp_recipients").select("phone,label").eq("active", true).then(({ data }) => setRecipients(data || []));
  }, []);
  return (
    <>
      <div className="msgbox">{text}</div>
      <div className="btnrow">
        <button className="btn sm ghost" onClick={() => { copyText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}>
          {copied ? "✓ Copied" : "Copy message"}
        </button>
        {recipients.map((r) => (
          <a key={r.phone} className="btn sm wa"
            href={`https://wa.me/${r.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(text)}`}
            target="_blank" rel="noreferrer">Send to {r.label || r.phone}</a>
        ))}
      </div>
    </>
  );
}

function MonthlySummary() {
  const app = useApp();
  const m = monthStr();
  const [text, setText] = useState("Loading…");
  useEffect(() => { (async () => {
    const [i, e, s, p] = await Promise.all([
      supabase.from("income_records").select("branch_id,program_id,amount_lak,unpaid_lak").gte("date", `${m}-01`).lte("date", `${m}-31`),
      supabase.from("expense_records").select("branch_id,amount_lak").gte("date", `${m}-01`).lte("date", `${m}-31`),
      supabase.from("student_records").select("branch_id,student_type").gte("date", `${m}-01`).lte("date", `${m}-31`),
      supabase.from("salary_payroll").select("status,net_lak").eq("month", m),
    ]);
    const ti = (i.data || []).reduce((s, r) => s + (Number(r.amount_lak) || 0), 0);
    const te = (e.data || []).reduce((s, r) => s + (Number(r.amount_lak) || 0), 0);
    const unpaid = (i.data || []).reduce((s, r) => s + (Number(r.unpaid_lak) || 0), 0);
    const students = s.data || [];
    const count = (t: string) => students.filter((x) => x.student_type === t).length;
    const branch = app.branches.map((b) =>
      `${b.name}: income ${fmt((i.data || []).filter((r) => r.branch_id === b.id).reduce((s, r) => s + (Number(r.amount_lak) || 0), 0))} LAK, expenses ${fmt((e.data || []).filter((r) => r.branch_id === b.id).reduce((s, r) => s + (Number(r.amount_lak) || 0), 0))} LAK`
    ).join("\n");
    const paid = (p.data || []).reduce((s, r) => s + (Number(r.net_lak) || 0), 0);
    setText(`ClickRobot Laos Monthly Report

Month: ${m}
Total Income: ${fmt(ti)} LAK
Total Expenses: ${fmt(te)} LAK
Net Profit: ${fmt(ti - te)} LAK
Unpaid Balance: ${fmt(unpaid)} LAK

Students:
New: ${count("New")}
Extension: ${count("Extension")}
Trial: ${count("Trial")}
Trial Converted: ${count("Trial Converted")}

Branch Performance:
${branch}

Salary Payout: ${fmt(paid)} LAK (${(p.data || []).filter((r) => r.status === "Paid").length} paid / ${(p.data || []).length} total)`);
  })(); }, [m, app.branches]);
  return <div className="panel"><h3>Monthly WhatsApp summary</h3><div className="msgbox">{text}</div>
    <div className="btnrow"><button className="btn sm ghost" onClick={() => copyText(text)}>Copy message</button></div></div>;
}
