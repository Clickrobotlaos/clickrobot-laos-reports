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
    package: "", package_size: "S", sessions: "", bonus_sessions: 0,
    discount_percent: 0, payment_type: PAYMENT_TYPES[0],
    notes: "",
  });
  const [mv, setMv] = useState<MoneyValue>({ amount: "", currency: "USD", rate: app.rates["USD"] || 1 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Student ID system
  const [idMode, setIdMode] = useState<"existing" | "new">("existing");
  const [leadId, setLeadId] = useState<string | null>(null);

  // Lead conversion prefill (set by Leads page "Convert to student")
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("lead_prefill");
    if (!raw) return;
    try {
      const p = JSON.parse(raw);
      setIdMode("new");
      setLeadId(p.lead_id || null);
      setF((prev: any) => ({
        ...prev,
        student_name: p.student_name || prev.student_name,
        parent_name: p.parent_name || prev.parent_name,
        phone: p.phone || prev.phone,
        program_id: p.program_id || prev.program_id,
        branch_id: p.branch_id || prev.branch_id,
      }));
    } catch (e) {}
    window.localStorage.removeItem("lead_prefill");
  }, []);
  const [idLookup, setIdLookup] = useState("");
  const [idStatus, setIdStatus] = useState<"" | "found" | "notfound" | "searching">("");
  const [newStudentId, setNewStudentId] = useState("");
  const [newIdStatus, setNewIdStatus] = useState<"" | "ok" | "duplicate" | "skip" | "low">(""); 
  const [latestId, setLatestId] = useState(0);
  const [nextId, setNextId] = useState("");

  // Fetch latest student ID on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("student_packages")
        .select("student_id").not("student_id", "is", null)
        .order("student_id", { ascending: false });
      if (data && data.length > 0) {
        // Find the highest numeric ID
        let maxNum = 0;
        for (const r of data) {
          const num = parseInt(r.student_id);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
        setLatestId(maxNum);
        setNextId(String(maxNum + 1));
        setNewStudentId(String(maxNum + 1));
      }
    })();
  }, []);

  // Auto-lookup existing student by ID
  const [foundStudent, setFoundStudent] = useState<any>(null);
  async function lookupStudent(studentId: string) {
    const trimmed = studentId.trim();
    setIdLookup(trimmed);
    setFoundStudent(null);
    if (!trimmed) { setIdStatus(""); return; }
    setIdStatus("searching");
    const { data } = await supabase.from("student_packages")
      .select("id,student_id,student_name,parent_name,phone,program_id,branch_id,package,package_size")
      .eq("student_id", trimmed).maybeSingle();
    if (data) {
      setIdStatus("found");
      setFoundStudent(data);
      // Auto-fill hidden fields for the invoice save
      setF((prev) => ({
        ...prev,
        student_name: data.student_name || prev.student_name,
        parent_name: data.parent_name || prev.parent_name,
        phone: data.phone || prev.phone,
        program_id: data.program_id || prev.program_id,
        branch_id: data.branch_id || prev.branch_id,
      }));
    } else {
      setIdStatus("notfound");
    }
  }

  // Validate new student ID
  async function validateNewId(val: string) {
    const trimmed = val.trim();
    setNewStudentId(trimmed);
    if (!trimmed) { setNewIdStatus(""); return; }
    const num = parseInt(trimmed);
    if (isNaN(num)) { setNewIdStatus(""); return; }

    // Check duplicate
    const { data } = await supabase.from("student_packages")
      .select("student_id").eq("student_id", trimmed).maybeSingle();
    if (data) {
      setNewIdStatus("duplicate");
      return;
    }

    // Check sequential
    const expected = latestId + 1;
    if (num < latestId) {
      setNewIdStatus("low");
    } else if (num > expected) {
      setNewIdStatus("skip");
    } else {
      setNewIdStatus("ok");
    }
  }

  async function save(sendNow: boolean) {
    if (!f.sessions || Number(f.sessions) < 1) {
      setErr("Number of sessions is required (used for attendance tracking).");
      return;
    }
    if (idMode === "existing" && !foundStudent) {
      setErr("Please search and select an existing student first.");
      return;
    }
    if (idMode === "new" && !f.student_name) {
      setErr("Student name is required for new students.");
      return;
    }
    if (idMode === "new" && newIdStatus === "duplicate") {
      setErr("Student ID already exists. Please use the next available ID.");
      return;
    }
    setBusy(true); setErr("");
    const { data: noData, error: noErr } = await supabase.rpc("next_invoice_no");
    if (noErr) { setErr(noErr.message); setBusy(false); return; }
    const invoice_no = noData as string;

    const totalSessions = Number(f.sessions) + (Number(f.bonus_sessions) || 0);
    const discountPct = Number(f.discount_percent) || 0;
    const rawAmount = Number(mv.amount) || 0;
    const discountedAmount = discountPct > 0 ? rawAmount * (1 - discountPct / 100) : rawAmount;

    const { data, error } = await supabase.from("invoices").insert({
      invoice_no, date: f.date, due_date: f.due_date, branch_id: f.branch_id,
      created_by: app.userId,
      student_name: f.student_name, parent_name: f.parent_name || null, phone: f.phone || null,
      program_id: f.program_id || null, package: f.package || null,
      package_size: f.package_size || null,
      sessions: totalSessions, bonus_sessions: Number(f.bonus_sessions) || 0,
      discount_percent: discountPct,
      original_amount: rawAmount,
      payment_type: f.payment_type,
      amount: discountedAmount, currency: mv.currency, rate_to_lak: Number(mv.rate),
      amount_lak: toLAK(discountedAmount, mv.rate),
      notes: f.notes || null,
      status: sendNow ? "Sent" : "Draft",
    }).select("id").single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    // If this invoice came from a lead conversion, mark the lead as Registered
    if (leadId) {
      await supabase.from("leads").update({
        status: "Registered", registered_at: new Date().toISOString(),
      }).eq("id", leadId);
      await supabase.from("lead_activities").insert({
        lead_id: leadId, action: "Registered",
        note: `Invoice ${invoice_no} created`,
        by_user: app.userId, by_name: app.userName,
      });
    }
    onDone(data?.id);
  }

  const programName = (id: string) => app.programs.find((p) => p.id === id)?.name || "";

  return (
    <div className="panel">
      {/* Tab header */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={idMode === "existing" ? "on" : ""} onClick={() => setIdMode("existing")}>
          🧾 Invoice
        </button>
        <button className={idMode === "new" ? "on" : ""} onClick={() => setIdMode("new")}>
          🆕 New Student
        </button>
      </div>

      {/* ===== INVOICE TAB (existing student) ===== */}
      {idMode === "existing" && (
        <>
          {/* Student search */}
          <div style={{ marginBottom: 16, padding: 14, background: "#F5F7FB", borderRadius: 12 }}>
            <Field label="Search by Student ID">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={idLookup} onChange={(e) => lookupStudent(e.target.value)}
                  placeholder="Type student ID..." style={{ maxWidth: 200, fontSize: 16 }} />
                {idStatus === "searching" && <span style={{ fontSize: 13, color: "var(--ink2)" }}>Searching…</span>}
                {idStatus === "notfound" && <span style={{ fontSize: 13, color: "#DC2626" }}>❌ No student with this ID</span>}
              </div>
            </Field>

            {/* Found student card */}
            {foundStudent && (
              <div style={{
                marginTop: 10, padding: 12, background: "white", borderRadius: 10,
                border: "1px solid #BBF7D0", display: "flex", justifyContent: "space-between",
                alignItems: "center", flexWrap: "wrap", gap: 8,
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    ✅ ID {foundStudent.student_id} — {foundStudent.student_name}
                  </div>
                  <div style={{ color: "var(--ink2)", fontSize: 13, marginTop: 2 }}>
                    {foundStudent.parent_name && <>Parent: {foundStudent.parent_name} · </>}
                    {foundStudent.phone && <>{foundStudent.phone} · </>}
                    {programName(foundStudent.program_id)}
                  </div>
                </div>
                <button className="btn sm ghost" onClick={() => window.open(`/students/${foundStudent.id}`, "_blank")}>
                  View profile →
                </button>
              </div>
            )}
          </div>

          {/* Invoice fields only (no student info fields) */}
          {foundStudent && (
            <>
              <div className="frow c3">
                <Field label="Invoice date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
                <Field label="Due date"><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
                <Field label="Branch">
                  <select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
                    {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
                <Field label="Program">
                  <select value={f.program_id} onChange={(e) => setF({ ...f, program_id: e.target.value })}>
                    {app.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
                <Field label="Package"><input value={f.package} onChange={(e) => setF({ ...f, package: e.target.value })} placeholder="e.g. Spike Prime S" /></Field>
                <Field label="Package size">
                  <select value={f.package_size} onChange={(e) => {
                    const sz = e.target.value;
                    const sessMap: Record<string, number> = { S: 16, M: 32, L: 48, TRIAL: 4, CAMP: 8 };
                    setF({ ...f, package_size: sz, sessions: sessMap[sz] ? String(sessMap[sz]) : f.sessions });
                  }}>
                    <option value="TRIAL">Trial (4)</option>
                    <option value="S">Small (16)</option>
                    <option value="M">Medium (32)</option>
                    <option value="L">Large (48)</option>
                    <option value="CAMP">Camp (8)</option>
                    <option value="SPECIAL">Special (custom)</option>
                  </select>
                </Field>
                <Field label="Base sessions ★" hint="Required — used for attendance.">
                  <input type="number" inputMode="numeric" min="1" value={f.sessions} onChange={(e) => setF({ ...f, sessions: e.target.value })} placeholder="e.g. 16" />
                </Field>
                <Field label="Bonus sessions (promotion)">
                  <input type="number" inputMode="numeric" min="0" value={f.bonus_sessions} onChange={(e) => setF({ ...f, bonus_sessions: Number(e.target.value) })} placeholder="0" />
                </Field>
                {(Number(f.bonus_sessions) > 0) && (
                  <Field label="Total sessions">
                    <input type="number" value={Number(f.sessions || 0) + Number(f.bonus_sessions || 0)} disabled style={{ background: "#f0f0f0", fontWeight: 700 }} />
                  </Field>
                )}
                <Field label="Discount %" hint="e.g. 10 = 10% off">
                  <input type="number" inputMode="numeric" min="0" max="100" value={f.discount_percent} onChange={(e) => setF({ ...f, discount_percent: Number(e.target.value) })} placeholder="0" />
                </Field>
                <Field label="Payment type"><Sel value={f.payment_type} options={PAYMENT_TYPES} onChange={(v) => setF({ ...f, payment_type: v })} /></Field>
              </div>
              <MoneyFields v={mv} set={setMv} rates={app.rates} />
              <div style={{ height: 12 }} />
              <Field label="Notes / terms (optional)"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Any note for the invoice." /></Field>
              {err && <div className="banner bad">{err}</div>}
              <div className="btnrow">
                <button className="btn" disabled={busy || !mv.amount || !f.sessions} onClick={() => save(true)}>{busy ? "Saving…" : "Create & send"}</button>
                <button className="btn ghost" disabled={busy} onClick={() => save(false)}>Save as draft</button>
                <button className="btn ghost" onClick={onCancel}>Cancel</button>
              </div>
            </>
          )}

          {!foundStudent && !idLookup && (
            <div className="empty" style={{ padding: 20 }}>Type a student ID above to create an invoice for an existing student.</div>
          )}
        </>
      )}

      {/* ===== NEW STUDENT TAB ===== */}
      {idMode === "new" && (
        <>
          {/* New student ID */}
          <div style={{ marginBottom: 16, padding: 14, background: "#F0FDF4", borderRadius: 12 }}>
            <Field label="Assign Student ID" hint={latestId > 0 ? `Latest registered ID: ${latestId} → Next: ${nextId}` : "No existing students yet."}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={newStudentId} onChange={(e) => validateNewId(e.target.value)}
                  placeholder={nextId || "e.g. 1"} style={{ maxWidth: 200, fontSize: 16 }} />
                {newIdStatus === "ok" && <span style={{ fontSize: 13, color: "#16A34A", fontWeight: 600 }}>✅ ID available</span>}
                {newIdStatus === "duplicate" && <span style={{ fontSize: 13, color: "#DC2626", fontWeight: 600 }}>❌ ID already exists! Please use {nextId}</span>}
                {newIdStatus === "skip" && <span style={{ fontSize: 13, color: "#D97706", fontWeight: 600 }}>⚠️ Expected {nextId}. Skipping numbers — are you sure?</span>}
                {newIdStatus === "low" && <span style={{ fontSize: 13, color: "#D97706", fontWeight: 600 }}>⚠️ Lower than latest ({latestId}). Are you sure?</span>}
              </div>
            </Field>
          </div>

          {/* All fields: student info + invoice */}
          <div className="frow c3">
            <Field label="Invoice date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Due date"><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
            <Field label="Branch">
              <select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
                {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Student name ★"><input value={f.student_name} onChange={(e) => setF({ ...f, student_name: e.target.value })} /></Field>
            <Field label="Parent name"><input value={f.parent_name} onChange={(e) => setF({ ...f, parent_name: e.target.value })} /></Field>
            <Field label="Parent phone (WhatsApp)"><input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+85620..." /></Field>
            <Field label="Program">
              <select value={f.program_id} onChange={(e) => setF({ ...f, program_id: e.target.value })}>
                {app.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Package"><input value={f.package} onChange={(e) => setF({ ...f, package: e.target.value })} placeholder="e.g. Spike Prime S" /></Field>
            <Field label="Package size">
              <select value={f.package_size} onChange={(e) => {
                const sz = e.target.value;
                const sessMap: Record<string, number> = { S: 16, M: 32, L: 48, TRIAL: 4, CAMP: 8 };
                setF({ ...f, package_size: sz, sessions: sessMap[sz] ? String(sessMap[sz]) : f.sessions });
              }}>
                <option value="TRIAL">Trial (4)</option>
                <option value="S">Small (16)</option>
                <option value="M">Medium (32)</option>
                <option value="L">Large (48)</option>
                <option value="CAMP">Camp (8)</option>
                <option value="SPECIAL">Special (custom)</option>
              </select>
            </Field>
            <Field label="Base sessions ★" hint="Required — used for attendance.">
              <input type="number" inputMode="numeric" min="1" value={f.sessions} onChange={(e) => setF({ ...f, sessions: e.target.value })} placeholder="e.g. 16" />
            </Field>
            <Field label="Bonus sessions (promotion)">
              <input type="number" inputMode="numeric" min="0" value={f.bonus_sessions} onChange={(e) => setF({ ...f, bonus_sessions: Number(e.target.value) })} placeholder="0" />
            </Field>
            {(Number(f.bonus_sessions) > 0) && (
              <Field label="Total sessions">
                <input type="number" value={Number(f.sessions || 0) + Number(f.bonus_sessions || 0)} disabled style={{ background: "#f0f0f0", fontWeight: 700 }} />
              </Field>
            )}
            <Field label="Discount %" hint="e.g. 10 = 10% off">
              <input type="number" inputMode="numeric" min="0" max="100" value={f.discount_percent} onChange={(e) => setF({ ...f, discount_percent: Number(e.target.value) })} placeholder="0" />
            </Field>
            <Field label="Payment type"><Sel value={f.payment_type} options={PAYMENT_TYPES} onChange={(v) => setF({ ...f, payment_type: v })} /></Field>
          </div>
          <MoneyFields v={mv} set={setMv} rates={app.rates} />
          <div style={{ height: 12 }} />
          <Field label="Notes / terms (optional)"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Any note for the invoice." /></Field>
          {err && <div className="banner bad">{err}</div>}
          <div className="btnrow">
            <button className="btn" disabled={busy || !mv.amount || !f.student_name || !f.sessions || newIdStatus === "duplicate"} onClick={() => save(true)}>{busy ? "Saving…" : "Create & send"}</button>
            <button className="btn ghost" disabled={busy || newIdStatus === "duplicate"} onClick={() => save(false)}>Save as draft</button>
            <button className="btn ghost" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
