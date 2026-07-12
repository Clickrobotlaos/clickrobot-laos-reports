"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field, Sel } from "@/components/ui";
import { CURRENCIES, PERMS, ROLE_LABELS, STAFF_STATUS, fmt, todayStr, csvDownload } from "@/lib/util";

export default function StaffPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  const can = PERMS[app.role];
  if (!can.staff) {
    return <Shell><div className="panel"><div className="empty">Only CEO / Admin can manage staff.</div></div></Shell>;
  }
  return <Shell><StaffDirectory /></Shell>;
}

function StaffDirectory() {
  const app = useApp();
  const router = useRouter();
  const can = PERMS[app.role] || PERMS.viewer;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [roleFilter, setRoleFilter] = useState("");
  const [showForm, setShowForm] = useState<null | any>(null);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [leaveBusy, setLeaveBusy] = useState<string | null>(null);
  const canApproveLeave = app.role === "admin" || app.role === "co_admin" || app.role === "manager";

  async function reload() {
    setLoading(true);
    const [all, exp, lv] = await Promise.all([
      supabase.from("users").select("*").order("name"),
      supabase.from("v_contracts_expiring").select("*").order("days_left"),
      canApproveLeave ? supabase.from("leave_requests").select("*").eq("status", "Pending").order("start_date") : Promise.resolve({ data: [] }),
    ]);
    setRows(all.data || []); setExpiring(exp.data || []); setPendingLeaves(lv.data || []); setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  const branchName = (id: string | null) => app.branches.find((b) => b.id === id)?.name || "";

  const visible = rows.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (roleFilter && r.role !== roleFilter) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return `${r.name} ${r.position || ""} ${r.email || ""} ${r.phone || ""}`.toLowerCase().includes(s);
  });

  return (
    <div>
      <div className="sectionhead">
        <h2>Staff directory</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm ghost" onClick={() => csvDownload("staff.csv", visible)} disabled={!visible.length}>Export CSV</button>
          <button className="btn sm" onClick={() => setShowForm({})}>+ Add staff</button>
        </div>
      </div>

      {/* 🏖️ Pending leave approvals */}
      {canApproveLeave && pendingLeaves.length > 0 && (
        <div className="panel" style={{ borderColor: "#7DD3FC", borderWidth: 2, background: "#F0F9FF" }}>
          <h3 style={{ color: "#0369A1" }}>🏖️ Pending leave requests ({pendingLeaves.length})</h3>
          <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
            {pendingLeaves.map((lv) => (
              <div key={lv.id} style={{ padding: 12, background: "white", borderRadius: 12, border: "1px solid #BAE6FD", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <b style={{ fontSize: 14.5 }}>{lv.user_name || "Staff"}</b>
                  <span className="pill Draft" style={{ marginLeft: 8, fontSize: 10.5 }}>{lv.leave_type}</span>
                  <div style={{ fontSize: 13, color: "var(--ink2)", marginTop: 3 }}>
                    {lv.start_date}{lv.end_date !== lv.start_date ? ` → ${lv.end_date}` : ""} · <b>{lv.days} day{Number(lv.days) !== 1 ? "s" : ""}</b>
                  </div>
                  {lv.reason && <div style={{ fontSize: 12.5, marginTop: 3 }}>Reason: {lv.reason}</div>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn sm ok" disabled={leaveBusy === lv.id} onClick={async () => {
                    setLeaveBusy(lv.id);
                    await supabase.from("leave_requests").update({
                      status: "Approved", reviewed_by: app.userId, reviewed_by_name: app.userName,
                      reviewed_at: new Date().toISOString(),
                    }).eq("id", lv.id);
                    setLeaveBusy(null); reload();
                  }}>✓ Approve</button>
                  <button className="btn sm bad" disabled={leaveBusy === lv.id} onClick={async () => {
                    const note = window.prompt("Reason for rejecting (optional):") || null;
                    setLeaveBusy(lv.id);
                    await supabase.from("leave_requests").update({
                      status: "Rejected", reviewed_by: app.userId, reviewed_by_name: app.userName,
                      reviewed_at: new Date().toISOString(), review_note: note,
                    }).eq("id", lv.id);
                    setLeaveBusy(null); reload();
                  }}>✗ Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {expiring.length > 0 && !showForm && (
        <div className="banner warn">
          🔔 {expiring.length} contract{expiring.length > 1 ? "s" : ""} ending in the next 30 days:
          &nbsp;{expiring.map((e) => `${e.name} (${e.days_left} days)`).join(" · ")}
        </div>
      )}

      {showForm !== null && (
        <StaffForm existing={Object.keys(showForm).length ? showForm : undefined}
          onDone={() => { setShowForm(null); reload(); }}
          onCancel={() => setShowForm(null)} />
      )}

      {showForm === null && (
        <>
          <div className="frow c3" style={{ marginBottom: 12 }}>
            <input placeholder="Search name, position, email, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {STAFF_STATUS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {loading ? <div className="panel"><div className="empty">Loading…</div></div>
            : visible.length === 0 ? <div className="panel"><div className="empty">No staff match.</div></div>
              : (
                <div className="tblwrap">
                  <table className="tbl">
                    <thead><tr>
                      <th>Name</th><th>Position</th><th>Role</th><th>Branch</th>
                      <th>Phone</th><th style={{ textAlign: "right" }}>Base salary</th>
                      <th>Status</th><th>Contract ends</th><th></th>
                    </tr></thead>
                    <tbody>{visible.map((r) => {
                      const daysLeft = r.contract_end
                        ? Math.floor((new Date(r.contract_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        : null;
                      const contractPill = daysLeft === null ? "—"
                        : daysLeft < 0 ? <span className="pill Rejected">Expired</span>
                          : daysLeft <= 30 ? <span className="pill Submitted">{daysLeft}d</span>
                            : <span className="pill Approved">{daysLeft}d</span>;
                      return (
                        <tr key={r.id}>
                          <td><b>{r.name}</b>{r.email && <div style={{ fontSize: 12, color: "var(--ink2)" }}>{r.email}</div>}</td>
                          <td>{r.position || "—"}</td>
                          <td>{ROLE_LABELS[r.role] || r.role}</td>
                          <td>{branchName(r.branch_id)}</td>
                          <td>{r.phone || "—"}</td>
                          <td className="num">{r.base_salary && (r.role !== "admin" || can.ceoSalary) ? `${fmt(r.base_salary, r.salary_currency)} ${r.salary_currency}` : "—"}</td>
                          <td>
                            <span className={"pill " + (r.status === "Active" ? "Approved" : r.status === "On leave" ? "Submitted" : "Rejected")}>
                              {r.status || "Active"}
                            </span>
                          </td>
                          <td>{contractPill}</td>
                          <td style={{ display: "flex", gap: 6 }}>
                            <button className="btn sm ghost" onClick={() => router.push(`/staff/${r.id}`)}>View</button>
                            <button className="btn sm ghost" onClick={() => setShowForm(r)}>Edit</button>
                          </td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              )}
        </>
      )}
    </div>
  );
}

/* ------------------- Collapsible section wrapper ------------------- */
function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: any }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, background: "#fff", marginTop: 12, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", background: "#F8FAFD", border: "none", padding: "12px 16px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          cursor: "pointer", fontWeight: 700, fontSize: 14, color: "var(--ink)",
        }}>
        <span>{title}</span>
        <span style={{ color: "var(--ink2)", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div style={{ padding: 16 }}>{children}</div>}
    </div>
  );
}

/* --------------------------- The form ------------------------------ */

function StaffForm({ existing, onDone, onCancel }: { existing?: any; onDone: () => void; onCancel: () => void }) {
  const app = useApp();
  const isSelfEdit = existing?.id === app.userId;
  // Locked fields when editing your own profile (unless you're the top-level admin, who can edit anything about themselves)
  const lockSalaryRole = isSelfEdit && app.role !== "admin";
  const [f, setF] = useState<any>(existing || {
    name: "", email: "", phone: "", position: "",
    role: "contractor", branch_id: app.branches[0]?.id || "",
    status: "Active", start_date: todayStr(), end_date: "",
    base_salary: "", salary_currency: "LAK",
    bank_name: "", bank_account_no: "", emergency_contact: "",
    id_card: "", address: "", notes: "",
    photo_url: "",
    // new HR fields
    date_of_birth: "", nationality: "", gender: "", marital_status: "",
    degree: "", field_of_study: "", university: "", graduation_year: "",
    workplace: "", employment_type: "", work_schedule: "",
    contract_start: "", contract_end: "", contract_type: "", contract_url: "",
    permanent_address: "", city: "", province: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true); setErr("");
    // Client-side guard: if editing self and locked, force original values back in
    const safeRole = lockSalaryRole ? existing.role : f.role;
    const safeBase = lockSalaryRole ? existing.base_salary : (Number(f.base_salary) || null);
    const safeCurrency = lockSalaryRole ? existing.salary_currency : (f.salary_currency || "LAK");
    const payload = {
      name: f.name || null, email: f.email || null, phone: f.phone || null,
      position: f.position || null, role: safeRole, branch_id: f.branch_id || null,
      status: f.status, start_date: f.start_date || null, end_date: f.end_date || null,
      base_salary: safeBase, salary_currency: safeCurrency,
      bank_name: f.bank_name || null, bank_account_no: f.bank_account_no || null,
      emergency_contact: f.emergency_contact || null,
      id_card: f.id_card || null, address: f.address || null, notes: f.notes || null,
      photo_url: f.photo_url || null, active: f.status === "Active",
      // HR
      date_of_birth: f.date_of_birth || null, nationality: f.nationality || null,
      gender: f.gender || null, marital_status: f.marital_status || null,
      degree: f.degree || null, field_of_study: f.field_of_study || null,
      university: f.university || null, graduation_year: Number(f.graduation_year) || null,
      workplace: f.workplace || null, employment_type: f.employment_type || null,
      work_schedule: f.work_schedule || null,
      contract_start: f.contract_start || null, contract_end: f.contract_end || null,
      contract_type: f.contract_type || null, contract_url: f.contract_url || null,
      permanent_address: f.permanent_address || null,
      city: f.city || null, province: f.province || null,
    };
    let result;
    if (existing?.id) {
      result = await supabase.from("users").update(payload).eq("id", existing.id);
    } else {
      if (f.role === "contractor") {
        result = await supabase.from("users").insert({ ...payload, id: crypto.randomUUID() });
      } else {
        setErr("For staff who need a login (roles other than Contractor), first create the account in Supabase → Authentication → Users, then edit that user's profile here.");
        setBusy(false); return;
      }
    }
    setBusy(false);
    if (result?.error) { setErr(result.error.message); return; }
    onDone();
  }

  return (
    <div className="panel">
      <h3>{existing ? `Edit staff — ${existing.name}` : "New staff member"}</h3>
      <div className="hint" style={{ marginBottom: 12 }}>Click any section to expand. Required fields marked with *.</div>

      <Section title="Basic info" defaultOpen>
        <div className="frow c3">
          <Field label="Full name *"><input value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Position"><input value={f.position || ""} onChange={(e) => setF({ ...f, position: e.target.value })} placeholder="e.g. Teacher, Cleaner, Marketing" /></Field>
          <Field label={lockSalaryRole ? "Role 🔒 (locked)" : "Role"} hint={lockSalaryRole ? "You cannot change your own role. Ask the CEO." : (f.role === "contractor" ? "No login — profile only." : "Has app login.")}>
            <select value={f.role} disabled={lockSalaryRole} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="contractor">Contractor / Part-time (no login)</option>
              <option value="staff">Full-time Staff (login)</option>
              <option value="finance">Finance / Admin (login)</option>
              <option value="manager">Operations Manager (login)</option>
              <option value="co_admin">Operations Manager (co-admin)</option>
              <option value="viewer">Viewer (login)</option>
              <option value="admin">CEO / Admin (login)</option>
            </select>
          </Field>
          <Field label="Branch">
            <select value={f.branch_id || ""} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
              <option value="">— No branch —</option>
              {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Phone"><input inputMode="tel" value={f.phone || ""} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+85620..." /></Field>
          <Field label="Email"><input type="email" value={f.email || ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Status"><Sel value={f.status || "Active"} options={STAFF_STATUS} onChange={(v) => setF({ ...f, status: v })} /></Field>
          <Field label="Start date"><input type="date" value={f.start_date || ""} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
          <Field label="End date (if terminated)"><input type="date" value={f.end_date || ""} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
          <Field label="Photo URL" hint="Paste a link to a hosted photo (optional).">
            <input value={f.photo_url || ""} onChange={(e) => setF({ ...f, photo_url: e.target.value })} placeholder="https://..." />
          </Field>
        </div>
      </Section>

      <Section title="Personal identity (DOB visible to admin & self only)">
        <div className="frow c3">
          <Field label="Date of birth"><input type="date" value={f.date_of_birth || ""} onChange={(e) => setF({ ...f, date_of_birth: e.target.value })} /></Field>
          <Field label="Nationality"><input value={f.nationality || ""} onChange={(e) => setF({ ...f, nationality: e.target.value })} placeholder="e.g. Lao" /></Field>
          <Field label="Gender">
            <select value={f.gender || ""} onChange={(e) => setF({ ...f, gender: e.target.value })}>
              <option value="">— Not specified —</option>
              <option>Male</option><option>Female</option><option>Prefer not to say</option>
            </select>
          </Field>
          <Field label="Marital status">
            <select value={f.marital_status || ""} onChange={(e) => setF({ ...f, marital_status: e.target.value })}>
              <option value="">— Not specified —</option>
              <option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option>
            </select>
          </Field>
          <Field label="ID card / passport"><input value={f.id_card || ""} onChange={(e) => setF({ ...f, id_card: e.target.value })} /></Field>
          <Field label="Emergency contact"><input value={f.emergency_contact || ""} onChange={(e) => setF({ ...f, emergency_contact: e.target.value })} placeholder="Name + phone" /></Field>
        </div>
      </Section>

      <Section title="Education">
        <div className="frow c3">
          <Field label="Highest degree"><input value={f.degree || ""} onChange={(e) => setF({ ...f, degree: e.target.value })} placeholder="e.g. Bachelor's, Master's" /></Field>
          <Field label="Field of study"><input value={f.field_of_study || ""} onChange={(e) => setF({ ...f, field_of_study: e.target.value })} placeholder="e.g. Computer Science" /></Field>
          <Field label="University / school"><input value={f.university || ""} onChange={(e) => setF({ ...f, university: e.target.value })} /></Field>
          <Field label="Graduation year"><input type="number" inputMode="numeric" min="1950" max="2100" value={f.graduation_year || ""} onChange={(e) => setF({ ...f, graduation_year: e.target.value })} placeholder="e.g. 2020" /></Field>
        </div>
      </Section>

      <Section title="Employment details">
        <div className="frow c3">
          <Field label="Workplace" hint="Extra location info (beyond branch).">
            <input value={f.workplace || ""} onChange={(e) => setF({ ...f, workplace: e.target.value })} placeholder="e.g. Teaches at Parkson Mon/Wed, Phakhao Sat" />
          </Field>
          <Field label="Employment type">
            <select value={f.employment_type || ""} onChange={(e) => setF({ ...f, employment_type: e.target.value })}>
              <option value="">— Not specified —</option>
              <option>Full-time</option><option>Part-time</option><option>Contract</option><option>Intern</option>
            </select>
          </Field>
          <Field label="Work schedule / days"><input value={f.work_schedule || ""} onChange={(e) => setF({ ...f, work_schedule: e.target.value })} placeholder="e.g. Mon–Fri 9:00–17:00" /></Field>
        </div>
      </Section>

      <Section title="Contract">
        <div className="frow c3">
          <Field label="Contract type">
            <select value={f.contract_type || ""} onChange={(e) => setF({ ...f, contract_type: e.target.value })}>
              <option value="">— Not specified —</option>
              <option>Permanent</option><option>Fixed-term</option><option>Renewable</option>
            </select>
          </Field>
          <Field label="Contract start"><input type="date" value={f.contract_start || ""} onChange={(e) => setF({ ...f, contract_start: e.target.value })} /></Field>
          <Field label="Contract end"><input type="date" value={f.contract_end || ""} onChange={(e) => setF({ ...f, contract_end: e.target.value })} /></Field>
          <Field label="Contract document URL" hint="Optional link to signed contract PDF.">
            <input value={f.contract_url || ""} onChange={(e) => setF({ ...f, contract_url: e.target.value })} placeholder="https://..." />
          </Field>
        </div>
      </Section>

      <Section title={lockSalaryRole ? "Salary defaults 🔒 (locked)" : "Salary defaults (used for payroll)"}>
        {lockSalaryRole && <div className="hint" style={{ marginBottom: 10 }}>You cannot change your own salary. Ask the CEO to update it.</div>}
        <div className="frow c3">
          <Field label="Base salary"><input type="number" inputMode="decimal" value={f.base_salary || ""} disabled={lockSalaryRole} onChange={(e) => setF({ ...f, base_salary: e.target.value })} placeholder="0" /></Field>
          <Field label="Salary currency">
            {lockSalaryRole ? (
              <input value={f.salary_currency || "LAK"} disabled />
            ) : (
              <Sel value={f.salary_currency || "LAK"} options={[...CURRENCIES]} onChange={(v) => setF({ ...f, salary_currency: v })} />
            )}
          </Field>
          <Field label="Bank name"><input value={f.bank_name || ""} onChange={(e) => setF({ ...f, bank_name: e.target.value })} /></Field>
          <Field label="Bank account number"><input value={f.bank_account_no || ""} onChange={(e) => setF({ ...f, bank_account_no: e.target.value })} /></Field>
        </div>
      </Section>

      <Section title="Addresses">
        <Field label="Current address"><input value={f.address || ""} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <div style={{ height: 12 }} />
        <Field label="Permanent / hometown address"><input value={f.permanent_address || ""} onChange={(e) => setF({ ...f, permanent_address: e.target.value })} /></Field>
        <div style={{ height: 12 }} />
        <div className="frow c2">
          <Field label="City"><input value={f.city || ""} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
          <Field label="Province"><input value={f.province || ""} onChange={(e) => setF({ ...f, province: e.target.value })} /></Field>
        </div>
      </Section>

      <Section title="Notes">
        <textarea rows={3} value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Any additional notes about this staff member." />
      </Section>

      {err && <div className="banner bad" style={{ marginTop: 12 }}>{err}</div>}

      <div className="btnrow">
        <button className="btn" disabled={busy || !f.name} onClick={save}>{busy ? "Saving…" : existing ? "Save changes" : "Add staff"}</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
