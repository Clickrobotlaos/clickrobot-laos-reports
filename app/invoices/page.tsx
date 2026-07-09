"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field, Sel, MoneyFields, MoneyValue } from "@/components/ui";
import {
  PERMS, PAYMENT_TYPES,
  fmt, todayStr, toLAK, csvDownload,
} from "@/lib/util";
import { InvoiceView } from "./InvoiceView";

export default function InvoicesPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  return <Shell><InvoicesView /></Shell>;
}

function InvoicesView() {
  const app = useApp();
  const can = PERMS[app.role];
  const [mode, setMode] = useState<"list" | "new" | "detail">("list");
  const [sel, setSel] = useState<any | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  async function reload() {
    setLoading(true);
    const { data } = await supabase.from("invoices").select("*").order("date", { ascending: false }).limit(500);
    setRows(data || []); setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  const programName = (id: string | null) => app.programs.find((p) => p.id === id)?.name || "";

  const visible = rows.filter((r) => {
    if (status && r.status !== status) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return String(r.invoice_no).toLowerCase().includes(s)
      || String(r.student_name || "").toLowerCase().includes(s)
      || String(r.parent_name || "").toLowerCase().includes(s)
      || String(r.phone || "").toLowerCase().includes(s);
  });

  if (mode === "new") return <InvoiceForm onDone={(id) => { reload(); if (id) { supabase.from("invoices").select("*").eq("id", id).single().then(({ data }) => { setSel(data); setMode("detail"); }); } else { setMode("list"); } }} onCancel={() => setMode("list")} />;

  if (mode === "detail" && sel) {
    return <InvoiceView invoice={sel} onBack={() => { setMode("list"); reload(); }} onChanged={(row) => setSel(row)} />;
  }

  return (
    <div>
      <div className="sectionhead">
        <h2>Invoices</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm ghost" onClick={() => csvDownload("invoices.csv", visible)} disabled={!visible.length}>Export Excel (CSV)</button>
          {can.addRecords && <button className="btn sm" onClick={() => setMode("new")}>+ New invoice</button>}
        </div>
      </div>

      <div className="frow c3" style={{ marginBottom: 12 }}>
        <input placeholder="Search invoice no, student, parent, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option>Draft</option><option>Sent</option><option>Paid</option><option>Cancelled</option>
        </select>
        <div />
      </div>

      {loading ? <div className="panel"><div className="empty">Loading…</div></div>
        : visible.length === 0 ? <div className="panel"><div className="empty">No invoices yet. Click &quot;+ New invoice&quot; to create one.</div></div>
          : (
            <div className="tblwrap"><table className="tbl">
              <thead><tr>
                <th>Invoice #</th><th>Date</th><th>Due</th><th>Parent / Student</th>
                <th>Program</th><th style={{ textAlign: "right" }}>Sessions</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th style={{ textAlign: "right" }}>LAK</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>{visible.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.invoice_no}</b></td>
                  <td>{r.date}</td><td>{r.due_date}</td>
                  <td>{r.parent_name || "—"}<br/><span style={{ color: "var(--ink2)", fontSize: 12 }}>{r.student_name}</span></td>
                  <td>{programName(r.program_id)}</td>
                  <td className="num">{r.sessions || "—"}</td>
                  <td className="num">{fmt(r.amount, r.currency)} {r.currency}</td>
                  <td className="num">{fmt(r.amount_lak)}</td>
                  <td><span className={"pill " + r.status}>{r.status}</span></td>
                  <td><button className="btn sm ghost" onClick={() => { setSel(r); setMode("detail"); }}>Open</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
    </div>
  );
}

function InvoiceForm({ onDone, onCancel }: { onDone: (id?: string) => void; onCancel: () => void }) {
  const app = useApp();
  const [f, setF] = useState({
    date: todayStr(), due_date: todayStr(),
    branch_id: app.branchId || app.branches[0]?.id || "",
    student_name: "", parent_name: "", phone: "",
    program_id: app.programs[0]?.id || "",
    package: "", sessions: "", payment_type: PAYMENT_TYPES[0],
    notes: "",
  });
  const [mv, setMv] = useState<MoneyValue>({ amount: "", currency: "LAK", rate: 1 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save(sendNow: boolean) {
    if (!f.sessions || Number(f.sessions) < 1) {
      setErr("Number of sessions is required (used for attendance tracking).");
      return;
    }
    setBusy(true); setErr("");
    const { data: noData, error: noErr } = await supabase.rpc("next_invoice_no");
    if (noErr) { setErr(noErr.message); setBusy(false); return; }
    const invoice_no = noData as string;

    const { data, error } = await supabase.from("invoices").insert({
      invoice_no, date: f.date, due_date: f.due_date, branch_id: f.branch_id,
      created_by: app.userId,
      student_name: f.student_name, parent_name: f.parent_name || null, phone: f.phone || null,
      program_id: f.program_id || null, package: f.package || null,
      sessions: Number(f.sessions), payment_type: f.payment_type,
      amount: Number(mv.amount), currency: mv.currency, rate_to_lak: Number(mv.rate),
      amount_lak: toLAK(mv.amount, mv.rate),
      notes: f.notes || null,
      status: sendNow ? "Sent" : "Draft",
    }).select("id").single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone(data?.id);
  }

  return (
    <div className="panel">
      <h3>New invoice</h3>
      <div className="frow c3">
        <Field label="Invoice date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Due date"><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
        <Field label="Branch">
          <select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
            {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Student name"><input value={f.student_name} onChange={(e) => setF({ ...f, student_name: e.target.value })} /></Field>
        <Field label="Parent name"><input value={f.parent_name} onChange={(e) => setF({ ...f, parent_name: e.target.value })} /></Field>
        <Field label="Parent phone (WhatsApp)"><input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+85620..." /></Field>
        <Field label="Program">
          <select value={f.program_id} onChange={(e) => setF({ ...f, program_id: e.target.value })}>
            {app.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Package"><input value={f.package} onChange={(e) => setF({ ...f, package: e.target.value })} placeholder="e.g. 12 sessions" /></Field>
        <Field label="Number of sessions ★" hint="Required — used for attendance tracking.">
          <input type="number" inputMode="numeric" min="1" value={f.sessions} onChange={(e) => setF({ ...f, sessions: e.target.value })} placeholder="e.g. 12" />
        </Field>
        <Field label="Payment type"><Sel value={f.payment_type} options={PAYMENT_TYPES} onChange={(v) => setF({ ...f, payment_type: v })} /></Field>
      </div>
      <MoneyFields v={mv} set={setMv} rates={app.rates} />
      <div style={{ height: 12 }} />
      <Field label="Notes / terms (optional)"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Any note that should appear on the invoice." /></Field>
      {err && <div className="banner bad">{err}</div>}
      <div className="btnrow">
        <button className="btn" disabled={busy || !mv.amount || !f.student_name || !f.sessions} onClick={() => save(true)}>{busy ? "Saving…" : "Create & send"}</button>
        <button className="btn ghost" disabled={busy} onClick={() => save(false)}>Save as draft</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
