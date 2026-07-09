"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field, Sel, MoneyFields, MoneyValue } from "@/components/ui";
import {
  PERMS, PAYMENT_TYPES, STUDENT_TYPES, EXPENSE_CATEGORIES, PAYMENT_METHODS,
  fmt, todayStr, toLAK, csvDownload,
} from "@/lib/util";

export default function RecordsPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  return <Shell><RecordsView /></Shell>;
}

function RecordsView() {
  const app = useApp();
  const can = PERMS[app.role];
  const isAdmin = app.role === "admin";
  const [tab, setTab] = useState<"income" | "expenses" | "students">("income");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [branchFilter, setBranchFilter] = useState("");

  async function reload() {
    setLoading(true);
    const table = tab === "income" ? "income_records" : tab === "expenses" ? "expense_records" : "student_records";
    const { data } = await supabase.from(table).select("*").order("date", { ascending: false }).limit(500);
    setRows(data || []); setLoading(false);
  }
  useEffect(() => { reload(); setAdding(false); setEditing(null); }, [tab]); // eslint-disable-line

  const branchName = (id: string | null) => app.branches.find((b) => b.id === id)?.name || "";
  const programName = (id: string | null) => app.programs.find((p) => p.id === id)?.name || "";

  const match = (r: any, fields: string[]) => {
    if (branchFilter && r.branch_id !== branchFilter) return false;
    if (!q) return true;
    return fields.some((k) => String(r[k] || "").toLowerCase().includes(q.toLowerCase()));
  };

  const visible = rows.filter((r) => {
    if (tab === "income") return match(r, ["student_name", "receipt_no", "parent_name"]);
    if (tab === "expenses") return match(r, ["description", "voucher_no", "category", "supplier"]);
    return match(r, ["student_name", "parent_name", "phone"]);
  });

  async function del(id: string) {
    if (!confirm("Delete this record permanently? This cannot be undone.")) return;
    const table = tab === "income" ? "income_records" : tab === "expenses" ? "expense_records" : "student_records";
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) { alert("Delete failed: " + error.message); return; }
    reload();
  }

  return (
    <div>
      <div className="sectionhead">
        <h2>Records</h2>
        {can.addRecords && !adding && !editing && (
          <button className="btn sm" onClick={() => setAdding(true)}>
            + Add {tab === "income" ? "income" : tab === "expenses" ? "expense" : "student"}
          </button>
        )}
      </div>
      <div className="tabs" style={{ marginBottom: 12 }}>
        {([["income", "Income"], ["expenses", "Expenses"], ["students", "Students"]] as const).map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {adding && tab === "income" && <IncomeForm onDone={() => { setAdding(false); reload(); }} />}
      {adding && tab === "expenses" && <ExpenseForm onDone={() => { setAdding(false); reload(); }} />}
      {adding && tab === "students" && <StudentForm onDone={() => { setAdding(false); reload(); }} />}

      {editing && tab === "income" && <IncomeForm existing={editing} onDone={() => { setEditing(null); reload(); }} />}
      {editing && tab === "expenses" && <ExpenseForm existing={editing} onDone={() => { setEditing(null); reload(); }} />}
      {editing && tab === "students" && <StudentForm existing={editing} onDone={() => { setEditing(null); reload(); }} />}

      {!adding && !editing && (
        <>
          <div className="frow c3" style={{ marginBottom: 12 }}>
            <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">All branches</option>
              {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <div>
              <button className="btn sm ghost" disabled={!visible.length}
                onClick={() => csvDownload(`${tab}.csv`, visible)}>Export Excel (CSV)</button>
            </div>
          </div>

          {loading ? <div className="panel"><div className="empty">Loading…</div></div>
            : visible.length === 0 ? <div className="panel"><div className="empty">No records match.</div></div>
              : tab === "income" ? (
                <div className="tblwrap"><table className="tbl">
                  <thead><tr><th>Date</th><th>Receipt</th><th>Student</th><th>Program</th><th>Type</th>
                    <th style={{ textAlign: "right" }}>Amount</th><th style={{ textAlign: "right" }}>LAK</th>
                    <th style={{ textAlign: "right" }}>Unpaid</th><th>Method</th>
                    {isAdmin && <th></th>}</tr></thead>
                  <tbody>{visible.map((r) => (
                    <tr key={r.id}><td>{r.date}</td><td>{r.receipt_no}</td><td>{r.student_name}</td>
                      <td>{programName(r.program_id)}</td><td>{r.payment_type}</td>
                      <td className="num">{fmt(r.amount, r.currency)} {r.currency}</td>
                      <td className="num">{fmt(r.amount_lak)}</td>
                      <td className="num">{r.unpaid_lak ? fmt(r.unpaid_lak) : "—"}</td>
                      <td>{r.payment_method}</td>
                      {isAdmin && <td style={{ display: "flex", gap: 6 }}>
                        <button className="btn sm ghost" onClick={() => setEditing(r)}>Edit</button>
                        <button className="btn sm bad" onClick={() => del(r.id)}>Delete</button>
                      </td>}
                    </tr>
                  ))}</tbody>
                </table></div>
              ) : tab === "expenses" ? (
                <div className="tblwrap"><table className="tbl">
                  <thead><tr><th>Date</th><th>Voucher</th><th>Category</th><th>Description</th>
                    <th style={{ textAlign: "right" }}>Amount</th><th style={{ textAlign: "right" }}>LAK</th>
                    <th>Supplier</th><th>Method</th>
                    {isAdmin && <th></th>}</tr></thead>
                  <tbody>{visible.map((r) => (
                    <tr key={r.id}><td>{r.date}</td><td>{r.voucher_no}</td><td>{r.category}</td>
                      <td>{r.description}</td><td className="num">{fmt(r.amount, r.currency)} {r.currency}</td>
                      <td className="num">{fmt(r.amount_lak)}</td><td>{r.supplier}</td><td>{r.payment_method}</td>
                      {isAdmin && <td style={{ display: "flex", gap: 6 }}>
                        <button className="btn sm ghost" onClick={() => setEditing(r)}>Edit</button>
                        <button className="btn sm bad" onClick={() => del(r.id)}>Delete</button>
                      </td>}
                    </tr>
                  ))}</tbody>
                </table></div>
              ) : (
                <div className="tblwrap"><table className="tbl">
                  <thead><tr><th>Date</th><th>Student</th><th>Parent</th><th>Phone</th><th>Program</th>
                    <th>Type</th><th>Converted</th><th style={{ textAlign: "right" }}>Paid (LAK)</th>
                    <th style={{ textAlign: "right" }}>Unpaid</th>
                    {isAdmin && <th></th>}</tr></thead>
                  <tbody>{visible.map((r) => (
                    <tr key={r.id}><td>{r.date}</td><td>{r.student_name}</td><td>{r.parent_name}</td>
                      <td>{r.phone}</td><td>{programName(r.program_id)}</td>
                      <td><span className="pill Submitted">{r.student_type}</span></td>
                      <td>{r.converted ? "Yes" : "No"}</td>
                      <td className="num">{fmt(r.amount_lak)}</td>
                      <td className="num">{r.unpaid_lak ? fmt(r.unpaid_lak) : "—"}</td>
                      {isAdmin && <td style={{ display: "flex", gap: 6 }}>
                        <button className="btn sm ghost" onClick={() => setEditing(r)}>Edit</button>
                        <button className="btn sm bad" onClick={() => del(r.id)}>Delete</button>
                      </td>}
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
        </>
      )}
    </div>
  );
}

/* -------- Forms: shared handler for insert/update -------- */

function IncomeForm({ existing, onDone }: { existing?: any; onDone: () => void }) {
  const app = useApp();
  const [f, setF] = useState<any>(existing || {
    date: todayStr(), receipt_no: "", branch_id: app.branchId || app.branches[0]?.id || "",
    student_name: "", parent_name: "", phone: "",
    program_id: app.programs[0]?.id || "", payment_type: PAYMENT_TYPES[0], package: "",
    unpaid_lak: "", payment_method: PAYMENT_METHODS[0], notes: "",
  });
  const [mv, setMv] = useState<MoneyValue>(existing
    ? { amount: existing.amount, currency: existing.currency, rate: existing.rate_to_lak }
    : { amount: "", currency: "LAK", rate: 1 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true); setErr("");
    const payload = {
      date: f.date, receipt_no: f.receipt_no || null, branch_id: f.branch_id,
      student_name: f.student_name || null,
      parent_name: f.parent_name || null, phone: f.phone || null,
      program_id: f.program_id || null, payment_type: f.payment_type, package: f.package || null,
      amount: Number(mv.amount), currency: mv.currency, rate_to_lak: Number(mv.rate),
      amount_lak: toLAK(mv.amount, mv.rate),
      unpaid_lak: Number(f.unpaid_lak) || 0,
      payment_method: f.payment_method, notes: f.notes || null,
    };
    const result = existing
      ? await supabase.from("income_records").update(payload).eq("id", existing.id)
      : await supabase.from("income_records").insert({ ...payload, received_by: app.userId, created_by: app.userId });
    setBusy(false);
    if (result.error) { setErr(result.error.message); return; }
    onDone();
  }

  return (
    <div className="panel">
      <h3>{existing ? "Edit income record" : "New income record"}</h3>
      <div className="frow c3">
        <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Receipt number"><input value={f.receipt_no || ""} onChange={(e) => setF({ ...f, receipt_no: e.target.value })} placeholder="R-0000" /></Field>
        <Field label="Branch">
          <select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
            {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Student name"><input value={f.student_name || ""} onChange={(e) => setF({ ...f, student_name: e.target.value })} /></Field>
        <Field label="Parent name"><input value={f.parent_name || ""} onChange={(e) => setF({ ...f, parent_name: e.target.value })} /></Field>
        <Field label="Phone"><input inputMode="tel" value={f.phone || ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Program">
          <select value={f.program_id || ""} onChange={(e) => setF({ ...f, program_id: e.target.value })}>
            {app.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Payment type"><Sel value={f.payment_type} options={PAYMENT_TYPES} onChange={(v) => setF({ ...f, payment_type: v })} /></Field>
        <Field label="Package"><input value={f.package || ""} onChange={(e) => setF({ ...f, package: e.target.value })} placeholder="e.g. 12 sessions" /></Field>
      </div>
      <MoneyFields v={mv} set={setMv} rates={app.rates} />
      <div className="frow c2" style={{ marginTop: 12 }}>
        <Field label="Unpaid balance (LAK)"><input type="number" inputMode="numeric" value={f.unpaid_lak ?? ""} onChange={(e) => setF({ ...f, unpaid_lak: e.target.value })} placeholder="0" /></Field>
        <Field label="Payment method"><Sel value={f.payment_method} options={PAYMENT_METHODS} onChange={(v) => setF({ ...f, payment_method: v })} /></Field>
      </div>
      <Field label="Notes"><textarea rows={2} value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {err && <div className="banner bad">{err}</div>}
      <div className="btnrow">
        <button className="btn" disabled={busy || !mv.amount || !f.branch_id} onClick={save}>{busy ? "Saving…" : existing ? "Save changes" : "Save income"}</button>
        <button className="btn ghost" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

function ExpenseForm({ existing, onDone }: { existing?: any; onDone: () => void }) {
  const app = useApp();
  const [f, setF] = useState<any>(existing || {
    date: todayStr(), voucher_no: "", branch_id: app.branchId || app.branches[0]?.id || "",
    category: EXPENSE_CATEGORIES[0], description: "", payment_method: PAYMENT_METHODS[0],
    supplier: "", notes: "",
  });
  const [mv, setMv] = useState<MoneyValue>(existing
    ? { amount: existing.amount, currency: existing.currency, rate: existing.rate_to_lak }
    : { amount: "", currency: "LAK", rate: 1 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true); setErr("");
    const payload = {
      date: f.date, voucher_no: f.voucher_no || null, branch_id: f.branch_id,
      category: f.category, description: f.description || null,
      amount: Number(mv.amount), currency: mv.currency, rate_to_lak: Number(mv.rate),
      amount_lak: toLAK(mv.amount, mv.rate),
      payment_method: f.payment_method, supplier: f.supplier || null, notes: f.notes || null,
    };
    const result = existing
      ? await supabase.from("expense_records").update(payload).eq("id", existing.id)
      : await supabase.from("expense_records").insert({ ...payload, paid_by: app.userId, created_by: app.userId });
    setBusy(false);
    if (result.error) { setErr(result.error.message); return; }
    onDone();
  }

  return (
    <div className="panel">
      <h3>{existing ? "Edit expense record" : "New expense record"}</h3>
      <div className="frow c3">
        <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Voucher number"><input value={f.voucher_no || ""} onChange={(e) => setF({ ...f, voucher_no: e.target.value })} placeholder="V-0000" /></Field>
        <Field label="Branch">
          <select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
            {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Category"><Sel value={f.category} options={EXPENSE_CATEGORIES} onChange={(v) => setF({ ...f, category: v })} /></Field>
        <Field label="Supplier / receiver"><input value={f.supplier || ""} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
      </div>
      <Field label="Description"><input value={f.description || ""} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What was this expense for?" /></Field>
      <div style={{ height: 12 }} />
      <MoneyFields v={mv} set={setMv} rates={app.rates} />
      <div className="frow" style={{ marginTop: 12 }}>
        <Field label="Payment method"><Sel value={f.payment_method} options={PAYMENT_METHODS} onChange={(v) => setF({ ...f, payment_method: v })} /></Field>
      </div>
      <Field label="Notes"><textarea rows={2} value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {err && <div className="banner bad">{err}</div>}
      <div className="btnrow">
        <button className="btn" disabled={busy || !mv.amount || !f.branch_id} onClick={save}>{busy ? "Saving…" : existing ? "Save changes" : "Save expense"}</button>
        <button className="btn ghost" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

function StudentForm({ existing, onDone }: { existing?: any; onDone: () => void }) {
  const app = useApp();
  const [f, setF] = useState<any>(existing || {
    date: todayStr(), branch_id: app.branchId || app.branches[0]?.id || "",
    student_name: "", parent_name: "", phone: "",
    program_id: app.programs[0]?.id || "",
    student_type: "New", package: "", quantity: 1, trial_status: "-",
    converted: false, unpaid_lak: "", notes: "",
  });
  const [mv, setMv] = useState<MoneyValue>(existing
    ? { amount: existing.amount, currency: existing.currency, rate: existing.rate_to_lak }
    : { amount: "", currency: "LAK", rate: 1 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true); setErr("");
    const payload = {
      date: f.date, branch_id: f.branch_id,
      student_name: f.student_name, parent_name: f.parent_name || null, phone: f.phone || null,
      program_id: f.program_id || null, student_type: f.student_type,
      package: f.package || null, quantity: Number(f.quantity) || 1,
      trial_status: f.trial_status || null, converted: !!f.converted,
      amount: Number(mv.amount) || 0, currency: mv.currency, rate_to_lak: Number(mv.rate),
      amount_lak: toLAK(mv.amount, mv.rate),
      unpaid_lak: Number(f.unpaid_lak) || 0, notes: f.notes || null,
    };
    const result = existing
      ? await supabase.from("student_records").update(payload).eq("id", existing.id)
      : await supabase.from("student_records").insert({ ...payload, created_by: app.userId });
    setBusy(false);
    if (result.error) { setErr(result.error.message); return; }
    onDone();
  }

  return (
    <div className="panel">
      <h3>{existing ? "Edit student record" : "New student registration"}</h3>
      <div className="frow c3">
        <Field label="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Branch">
          <select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
            {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Program">
          <select value={f.program_id || ""} onChange={(e) => setF({ ...f, program_id: e.target.value })}>
            {app.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Student name"><input value={f.student_name || ""} onChange={(e) => setF({ ...f, student_name: e.target.value })} /></Field>
        <Field label="Parent name"><input value={f.parent_name || ""} onChange={(e) => setF({ ...f, parent_name: e.target.value })} /></Field>
        <Field label="Phone"><input inputMode="tel" value={f.phone || ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Student type">
          <Sel value={f.student_type} options={STUDENT_TYPES}
            onChange={(v) => setF({ ...f, student_type: v, converted: v === "Trial Converted" ? true : f.converted })} />
        </Field>
        <Field label="Package"><input value={f.package || ""} onChange={(e) => setF({ ...f, package: e.target.value })} /></Field>
        <Field label="Quantity"><input type="number" inputMode="numeric" min="1" value={f.quantity || 1} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) || 1 })} /></Field>
        <Field label="Trial status"><Sel value={f.trial_status || "-"} options={["-", "Scheduled", "Attended", "No-show"]} onChange={(v) => setF({ ...f, trial_status: v })} /></Field>
        <Field label="Converted">
          <Sel value={f.converted ? "Yes" : "No"} options={["No", "Yes"]} onChange={(v) => setF({ ...f, converted: v === "Yes" })} />
        </Field>
        <Field label="Unpaid balance (LAK)"><input type="number" inputMode="numeric" value={f.unpaid_lak ?? ""} onChange={(e) => setF({ ...f, unpaid_lak: e.target.value })} placeholder="0" /></Field>
      </div>
      <MoneyFields v={mv} set={setMv} rates={app.rates} />
      <div style={{ height: 12 }} />
      <Field label="Notes"><textarea rows={2} value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {err && <div className="banner bad">{err}</div>}
      <div className="btnrow">
        <button className="btn" disabled={busy || !f.student_name || !f.branch_id} onClick={save}>{busy ? "Saving…" : existing ? "Save changes" : "Save registration"}</button>
        <button className="btn ghost" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
