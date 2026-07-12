"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field, Sel } from "@/components/ui";
import { CURRENCIES, PERMS, fmt, monthStr, toLAK, todayStr, csvDownload } from "@/lib/util";

export default function PayrollPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  const can = PERMS[app.role] || PERMS.viewer;
  if (!can.payroll) {
    return <Shell><div className="panel"><div className="empty">You don&apos;t have permission to view this page. Contact your administrator.</div></div></Shell>;
  }
  return <Shell><PayrollView /></Shell>;
}

function PayrollView() {
  const app = useApp();
  const can = PERMS[app.role];
  const isAdmin = app.role === "admin";
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [slip, setSlip] = useState<any | null>(null);

  async function reload() {
    setLoading(true);
    // Load all payroll rows, then filter out admin (CEO) rows for users without ceoSalary perm
    const [payroll, admins] = await Promise.all([
      supabase.from("salary_payroll").select("*").order("month", { ascending: false }).limit(200),
      supabase.from("users").select("id,name").eq("role", "admin"),
    ]);
    const adminIds = new Set((admins.data || []).map((u: any) => u.id));
    const adminNames = new Set((admins.data || []).map((u: any) => (u.name || "").toLowerCase().trim()));
    let data = payroll.data || [];
    if (!can.ceoSalary) {
      data = data.filter((r: any) => {
        if (r.user_id && adminIds.has(r.user_id)) return false;
        if (!r.user_id && r.staff_name && adminNames.has(r.staff_name.toLowerCase().trim())) return false;
        return true;
      });
    }
    setRows(data);
    setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  async function markPaid(id: string) {
    const { error } = await supabase.from("salary_payroll")
      .update({ status: "Paid", pay_date: todayStr() }).eq("id", id);
    if (error) { alert(error.message); return; }
    reload();
  }
  async function del(id: string) {
    if (!confirm("Delete this salary record permanently?")) return;
    const { error } = await supabase.from("salary_payroll").delete().eq("id", id);
    if (error) { alert("Delete failed: " + error.message); return; }
    reload();
  }

  return (
    <div>
      <div className="sectionhead">
        <h2>Salary payroll</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm ghost" onClick={() => csvDownload("payroll.csv", rows)} disabled={!rows.length}>Export Excel (CSV)</button>
          {can.payroll && !adding && !editing && <button className="btn sm" onClick={() => setAdding(true)}>+ Add salary</button>}
        </div>
      </div>
      {adding && <PayrollForm onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />}
      {editing && <PayrollForm existing={editing} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />}
      {!adding && !editing && (
        loading ? <div className="panel"><div className="empty">Loading…</div></div>
          : rows.length === 0 ? <div className="panel"><div className="empty">No salary records yet.</div></div>
            : (
              <div className="tblwrap"><table className="tbl">
                <thead><tr><th>Month</th><th>Staff</th><th>Position</th>
                  <th style={{ textAlign: "right" }}>Net</th><th style={{ textAlign: "right" }}>Net (LAK)</th>
                  <th>Status</th><th></th></tr></thead>
                <tbody>{rows.map((p) => (
                  <tr key={p.id}>
                    <td>{p.month}</td><td>{p.staff_name}</td><td>{p.position}</td>
                    <td className="num">{fmt(p.net, p.currency)} {p.currency}</td>
                    <td className="num">{fmt(p.net_lak)}</td>
                    <td><span className={"pill " + p.status}>{p.status}</span></td>
                    <td style={{ display: "flex", gap: 6 }}>
                      {can.payroll && p.status === "Pending" && <button className="btn sm ok" onClick={() => markPaid(p.id)}>Mark paid</button>}
                      <button className="btn sm ghost" onClick={() => setSlip(p)}>Payslip</button>
                      {isAdmin && <button className="btn sm ghost" onClick={() => setEditing(p)}>Edit</button>}
                      {isAdmin && <button className="btn sm bad" onClick={() => del(p.id)}>Delete</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            )
      )}
      {slip && <Payslip pay={slip} onClose={() => setSlip(null)} />}
    </div>
  );
}

function PayrollForm({ existing, onDone, onCancel }: { existing?: any; onDone: () => void; onCancel: () => void }) {
  const app = useApp();
  const can = PERMS[app.role] || PERMS.viewer;
  const [staffList, setStaffList] = useState<any[]>([]);
  const [f, setF] = useState<any>(existing || {
    month: monthStr(), staff_id: "", staff_name: "", position: "",
    base: "", bonus: "", benefits: "", overtime: "", deductions: "",
    currency: "LAK", rate: 1, pay_date: "", status: "Pending", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const net = (Number(f.base) || 0) + (Number(f.bonus) || 0) + (Number(f.benefits) || 0) + (Number(f.overtime) || 0) - (Number(f.deductions) || 0);
  const netLak = toLAK(net, f.rate);

  useEffect(() => {
    supabase.from("users").select("id,name,position,base_salary,salary_currency,role").eq("status", "Active").order("name").then(({ data }) => {
      let list = data || [];
      if (!can.ceoSalary) list = list.filter((u: any) => u.role !== "admin");
      setStaffList(list);
    });
  }, []);

  function pickStaff(id: string) {
    const s = staffList.find((x) => x.id === id);
    if (!s) { setF({ ...f, staff_id: "", staff_name: "" }); return; }
    setF({
      ...f,
      staff_id: s.id,
      staff_name: s.name,
      position: s.position || f.position,
      base: s.base_salary || f.base,
      currency: s.salary_currency || f.currency,
      rate: app.rates[s.salary_currency || "LAK"] || 1,
    });
  }

  async function save() {
    setBusy(true); setErr("");
    const slipNo = existing?.slip_no || `SLIP-${f.month.replace("-", "")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const payload = {
      month: f.month, user_id: f.staff_id || null,
      staff_name: f.staff_name, position: f.position || null,
      base: Number(f.base) || 0, bonus: Number(f.bonus) || 0,
      benefits: Number(f.benefits) || 0, overtime: Number(f.overtime) || 0,
      deductions: Number(f.deductions) || 0,
      net, currency: f.currency, rate_to_lak: Number(f.rate) || 1, net_lak: netLak,
      pay_date: f.pay_date || null, status: f.status, notes: f.notes || null,
    };
    const result = existing
      ? await supabase.from("salary_payroll").update(payload).eq("id", existing.id)
      : await supabase.from("salary_payroll").insert({ ...payload, slip_no: slipNo });
    setBusy(false);
    if (result.error) { setErr(result.error.message); return; }
    onDone();
  }

  return (
    <div className="panel">
      <h3>{existing ? "Edit salary record" : "New salary record"}</h3>
      <div className="frow c3">
        <Field label="Month"><input type="month" value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} /></Field>
        <Field label="Staff member" hint="Select from staff directory to auto-fill.">
          <select value={f.staff_id || ""} onChange={(e) => pickStaff(e.target.value)}>
            <option value="">— Select staff or type name below —</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.position ? ` · ${s.position}` : ""}</option>
            ))}
          </select>
        </Field>
        <Field label="Staff name (or override)"><input value={f.staff_name} onChange={(e) => setF({ ...f, staff_name: e.target.value })} /></Field>
        <Field label="Position"><input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></Field>
      </div>
      <div className="frow c3">
        <Field label="Base salary"><input type="number" inputMode="decimal" value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })} placeholder="0" /></Field>
        <Field label="Bonus"><input type="number" inputMode="decimal" value={f.bonus} onChange={(e) => setF({ ...f, bonus: e.target.value })} placeholder="0" /></Field>
        <Field label="Benefits"><input type="number" inputMode="decimal" value={f.benefits} onChange={(e) => setF({ ...f, benefits: e.target.value })} placeholder="0" /></Field>
        <Field label="Overtime"><input type="number" inputMode="decimal" value={f.overtime} onChange={(e) => setF({ ...f, overtime: e.target.value })} placeholder="0" /></Field>
        <Field label="Deductions"><input type="number" inputMode="decimal" value={f.deductions} onChange={(e) => setF({ ...f, deductions: e.target.value })} placeholder="0" /></Field>
        <Field label="Salary currency">
          <Sel value={f.currency} options={[...CURRENCIES]}
            onChange={(c) => setF({ ...f, currency: c, rate: app.rates[c] || 1 })} />
        </Field>
      </div>
      <div className="frow c3">
        <Field label={`Exchange rate (1 ${f.currency} → LAK)`}>
          <input type="number" inputMode="decimal" value={f.rate} disabled={f.currency === "LAK"} onChange={(e) => setF({ ...f, rate: Number(e.target.value) })} />
        </Field>
        <Field label="Payment date"><input type="date" value={f.pay_date || ""} onChange={(e) => setF({ ...f, pay_date: e.target.value })} /></Field>
        <Field label="Status"><Sel value={f.status} options={["Pending", "Paid", "Hold"]} onChange={(v) => setF({ ...f, status: v })} /></Field>
      </div>
      <div className="lakbox">Net salary = {fmt(net, f.currency)} {f.currency} &nbsp;→&nbsp; {fmt(netLak)} LAK</div>
      <div style={{ height: 12 }} />
      <Field label="Notes"><textarea rows={2} value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {err && <div className="banner bad">{err}</div>}
      <div className="btnrow">
        <button className="btn" disabled={busy || !f.staff_name || !f.base} onClick={save}>{busy ? "Saving…" : existing ? "Save changes" : "Save salary record"}</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Payslip({ pay, onClose }: { pay: any; onClose: () => void }) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="slip">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2>ClickRobot Laos</h2>
            <div style={{ fontSize: 13, color: "#555" }}>Salary payslip</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 13 }}>
            <div><b>{pay.slip_no}</b></div>
            <div>Month: {pay.month}</div>
            <div>Paid: {pay.pay_date || "—"}</div>
          </div>
        </div>
        <table>
          <tbody>
            <tr><td>Staff name</td><td><b>{pay.staff_name}</b></td></tr>
            <tr><td>Position</td><td>{pay.position}</td></tr>
            <tr><td>Base salary</td><td>{fmt(pay.base, pay.currency)} {pay.currency}</td></tr>
            <tr><td>Bonus</td><td>{fmt(pay.bonus, pay.currency)} {pay.currency}</td></tr>
            <tr><td>Benefits</td><td>{fmt(pay.benefits, pay.currency)} {pay.currency}</td></tr>
            <tr><td>Overtime</td><td>{fmt(pay.overtime, pay.currency)} {pay.currency}</td></tr>
            <tr><td>Deductions</td><td>− {fmt(pay.deductions, pay.currency)} {pay.currency}</td></tr>
            <tr className="net"><td>Net salary</td><td>{fmt(pay.net, pay.currency)} {pay.currency}</td></tr>
            <tr><td>Equivalent in LAK</td><td>{fmt(pay.net_lak)} LAK</td></tr>
          </tbody>
        </table>
        <div className="sig">
          <div><span>Prepared by</span></div>
          <div><span>Received by</span></div>
        </div>
        <div className="btnrow noprint">
          <button className="btn" onClick={() => window.print()}>Print / Export PDF</button>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
