"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field, Sel } from "@/components/ui";
import { PERMS, copyText, fmt } from "@/lib/util";
import { QRCodeSVG } from "qrcode.react";

const PKG_SESSIONS: Record<string, number> = { S: 16, M: 32, L: 48, TRIAL: 4, CAMP: 8 };
const STATUS_OPTIONS = ["Active", "Passive", "Inactive"];

export default function StudentDetailPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  return <Shell><StudentDetail /></Shell>;
}

function StudentDetail() {
  const app = useApp();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const can = PERMS[app.role] || PERMS.viewer;
  const isAdmin = app.role === "admin";
  const canEdit = can.addRecords || app.role === "admin" || app.role === "co_admin";

  const [pkg, setPkg] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  async function reload() {
    if (!id) return;
    setLoading(true);
    const { data: p } = await supabase.from("student_packages").select("*").eq("id", id).maybeSingle();
    setPkg(p);
    const { data: h } = await supabase.from("attendance").select("*").eq("package_id", id).order("date", { ascending: false });
    setHistory(h || []);
    if (p?.invoice_id) {
      const { data: inv } = await supabase.from("invoices").select("*").eq("id", p.invoice_id).maybeSingle();
      setInvoice(inv);
    }
    setLoading(false);
  }
  useEffect(() => { reload(); }, [id]); // eslint-disable-line

  // CEO: delete directly
  async function deleteStudent() {
    if (!pkg) return;
    setDeleting(true);
    // Delete attendance first (FK)
    await supabase.from("attendance").delete().eq("package_id", pkg.id);
    // Delete class bookings (FK)
    await supabase.from("class_bookings").delete().eq("package_id", pkg.id);
    // Delete the student package
    const { error } = await supabase.from("student_packages").delete().eq("id", pkg.id);
    setDeleting(false);
    if (error) { alert("Delete failed: " + error.message); return; }
    router.push("/students");
  }

  // Co-admin: request deletion (CEO approves)
  async function requestDeletion() {
    if (!pkg || !deleteReason.trim()) return;
    setDeleting(true);
    const { error } = await supabase.from("deletion_requests").insert({
      student_id: pkg.id,
      student_name: pkg.student_name,
      requested_by: app.userId,
      requested_by_name: app.userName,
      reason: deleteReason.trim(),
    });
    setDeleting(false);
    if (error) { alert("Request failed: " + error.message); return; }
    setRequestSent(true);
    setShowDeleteConfirm(false);
  }

  if (loading) return <div className="panel"><div className="empty">Loading…</div></div>;
  if (!pkg) return (
    <div>
      <button className="btn sm ghost" onClick={() => router.push("/students")}>← Back to students</button>
      <div className="panel"><div className="empty">Student not found.</div></div>
    </div>
  );

  const branchName = app.branches.find((b) => b.id === pkg.branch_id)?.name || "";
  const programName = app.programs.find((p) => p.id === pkg.program_id)?.name || "";
  const left = Math.max(0, pkg.sessions_total - pkg.sessions_used);
  const presents = history.filter((h) => h.status === "Present").length;
  const absents = history.filter((h) => h.status === "Absent").length;
  const rate = history.length ? Math.round((presents / history.length) * 100) : 0;
  const studentStatus = pkg.student_status || (pkg.active ? "Active" : "Inactive");

  const portalUrl = typeof window !== "undefined"
    ? `${window.location.origin}/p/${pkg.public_token}`
    : "";
  const waMessage = `Hi ${pkg.parent_name || "Parent"}!\n\nHere's your ClickRobot parent portal for ${pkg.student_name}:\n${portalUrl}\n\nYou can see:\n✓ Sessions remaining\n✓ Attendance history\n✓ Invoices\n\nBookmark this link to check anytime!\n\n- ClickRobot Laos`;
  const waLink = pkg.phone
    ? `https://wa.me/${pkg.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(waMessage)}`
    : null;

  if (editing) {
    return <StudentEditForm pkg={pkg} onDone={() => { setEditing(false); reload(); }} onCancel={() => setEditing(false)} />;
  }

  return (
    <div>
      <button className="btn sm ghost" onClick={() => router.push("/students")}>← Back to students</button>

      {/* Header panel */}
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {pkg.photo_url ? (
              <img src={pkg.photo_url} alt="" style={{ width: 64, height: 64, borderRadius: 32, objectFit: "cover", border: "1px solid var(--line)" }} />
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: 32, background: "var(--accent2)", color: "var(--accent)", display: "grid", placeItems: "center", fontFamily: "var(--font-disp)", fontSize: 26, fontWeight: 700 }}>
                {(pkg.student_name || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h3 style={{ marginBottom: 4 }}>
                {pkg.student_name}
                {pkg.student_id && <span style={{ color: "var(--ink2)", fontSize: 13, fontWeight: 400, marginLeft: 8 }}>ID: {pkg.student_id}</span>}
              </h3>
              <div style={{ color: "var(--ink2)", fontSize: 13.5 }}>
                {programName} · {branchName}
                {pkg.parent_name && <> · Parent: {pkg.parent_name}</>}
                {pkg.phone && <> · {pkg.phone}</>}
                {pkg.gender && <> · {pkg.gender}</>}
                {pkg.date_of_birth && <> · DOB: {pkg.date_of_birth}</>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className={"pill " + (studentStatus === "Active" ? "Approved" : studentStatus === "Passive" ? "Draft" : "Rejected")}>{studentStatus}</span>
            {canEdit && <button className="btn sm" onClick={() => setEditing(true)}>✏️ Edit</button>}
          </div>
        </div>

        <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", marginTop: 14 }}>
          <div className="card"><div className="lbl">Package</div><div className="val" style={{ fontSize: 15 }}>{pkg.package || "—"}{pkg.package_size && <span style={{ fontSize: 12, color: "var(--ink2)" }}> ({pkg.package_size})</span>}</div></div>
          <div className="card"><div className="lbl">Base sessions</div><div className="val">{pkg.base_sessions || pkg.sessions_total}</div></div>
          {(pkg.bonus_sessions || 0) > 0 && <div className="card ok"><div className="lbl">Bonus</div><div className="val">+{pkg.bonus_sessions}</div></div>}
          <div className="card"><div className="lbl">Total</div><div className="val">{pkg.sessions_total}</div></div>
          <div className="card ok"><div className="lbl">Used</div><div className="val">{pkg.sessions_used}</div></div>
          <div className={"card " + (left === 0 ? "bad" : left <= 2 ? "" : "ok")}>
            <div className="lbl">Remaining</div><div className="val">{left}</div>
          </div>
          {(pkg.discount_percent || 0) > 0 && <div className="card"><div className="lbl">Discount</div><div className="val">{pkg.discount_percent}%</div></div>}
        </div>

        <div className="btnrow">
          {pkg.phone && (
            <a className="btn sm wa" href={`https://wa.me/${pkg.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer">
              WhatsApp parent
            </a>
          )}
          {invoice && (
            <button className="btn sm ghost" onClick={() => router.push(`/invoices?open=${invoice.id}`)}>
              View invoice {invoice.invoice_no}
            </button>
          )}
          {/* CEO: direct delete */}
          {isAdmin && (
            <button className="btn sm bad" onClick={() => setShowDeleteConfirm(true)}>🗑️ Delete student</button>
          )}
          {/* Co-admin: request deletion */}
          {!isAdmin && canEdit && !requestSent && (
            <button className="btn sm bad" onClick={() => setShowDeleteConfirm(true)}>📋 Request deletion</button>
          )}
          {requestSent && <span className="pill Draft">✓ Deletion request sent to CEO</span>}
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div style={{ marginTop: 12, padding: 16, background: "#FFF5F5", border: "1px solid #FCA5A5", borderRadius: 12 }}>
            {isAdmin ? (
              <>
                <p style={{ fontWeight: 600, color: "#B91C1C", marginBottom: 8 }}>
                  ⚠️ Are you sure you want to delete {pkg.student_name}?
                </p>
                <p style={{ color: "var(--ink2)", fontSize: 13, marginBottom: 12 }}>
                  This will permanently remove this student, their attendance history, and class bookings. This cannot be undone.
                </p>
                <div className="btnrow">
                  <button className="btn sm bad" disabled={deleting} onClick={deleteStudent}>
                    {deleting ? "Deleting…" : "Yes, delete permanently"}
                  </button>
                  <button className="btn sm ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontWeight: 600, color: "#B91C1C", marginBottom: 8 }}>
                  📋 Request to delete {pkg.student_name}
                </p>
                <p style={{ color: "var(--ink2)", fontSize: 13, marginBottom: 12 }}>
                  Only the CEO can delete students. Please provide a reason and the CEO will review your request.
                </p>
                <Field label="Reason for deletion *">
                  <textarea rows={2} value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="e.g. Student has left the school, duplicate record, parent requested removal..." />
                </Field>
                <div className="btnrow" style={{ marginTop: 8 }}>
                  <button className="btn sm" disabled={deleting || !deleteReason.trim()} onClick={requestDeletion}>
                    {deleting ? "Sending…" : "Submit request to CEO"}
                  </button>
                  <button className="btn sm ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* QR Code + Parent portal panel */}
      <div className="panel" style={{ borderColor: "var(--accent)", borderWidth: 2, background: "linear-gradient(135deg, #F5F3FF 0%, #FCE7F3 100%)" }}>
        <h3>🌟 Student QR Code & Parent Portal</h3>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start", marginTop: 12 }}>
          {/* QR Code */}
          <div style={{ background: "white", padding: 16, borderRadius: 12, border: "1px solid var(--line)", textAlign: "center" }}>
            <QRCodeSVG value={portalUrl} size={180} level="M" includeMargin />
            <div style={{ fontSize: 12, color: "var(--ink2)", marginTop: 8 }}>
              ID: {pkg.student_id || "—"} · {pkg.student_name}
            </div>
            <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => {
              const svg = document.querySelector(".qr-print-area svg");
              if (!svg) return;
              const win = window.open("", "_blank");
              if (!win) return;
              win.document.write(`<html><head><title>QR - ${pkg.student_name}</title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif}h2{margin:8px 0}p{color:#666;font-size:14px}</style></head><body><h2>${pkg.student_name}</h2><p>ID: ${pkg.student_id || "—"}</p>${svg.outerHTML}<p>Scan to check attendance & info</p></body></html>`);
              win.document.close();
              win.print();
            }}>🖨️ Print QR</button>
          </div>
          <div className="qr-print-area" style={{ display: "none" }}>
            <QRCodeSVG value={portalUrl} size={300} level="M" includeMargin />
          </div>

          {/* Portal link */}
          <div style={{ flex: 1, minWidth: 250 }}>
            <div className="hint" style={{ marginBottom: 10 }}>
              Send this QR code or link to {pkg.parent_name || "the parent"} — they see a colorful dashboard with their child&apos;s sessions, attendance, and invoices.
            </div>
            <div style={{ padding: 10, background: "white", borderRadius: 10, fontSize: 12.5, fontFamily: "monospace", wordBreak: "break-all", border: "1px solid var(--line)" }}>
              {portalUrl}
            </div>
            <div className="btnrow" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => { copyText(portalUrl); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 1800); }}>
                {copiedLink ? "✓ Copied" : "Copy link"}
              </button>
              {waLink && <a className="btn wa" href={waLink} target="_blank" rel="noreferrer">📱 Send via WhatsApp</a>}
              <a className="btn ghost" href={portalUrl} target="_blank" rel="noreferrer">Preview portal</a>
            </div>
          </div>
        </div>
      </div>

      {/* Attendance summary */}
      <div className="panel">
        <h3>Attendance summary</h3>
        <div className="cards" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <div className="card ok"><div className="lbl">Attended</div><div className="val">{presents}</div></div>
          <div className="card bad"><div className="lbl">Absent</div><div className="val">{absents}</div></div>
          <div className="card"><div className="lbl">Attendance rate</div><div className="val">{rate}%</div></div>
        </div>
      </div>

      {/* Attendance history */}
      <div className="panel">
        <h3>Attendance history</h3>
        {history.length === 0 ? (
          <div className="empty">No attendance records yet.</div>
        ) : (
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr><th>Date</th><th>Status</th><th>Notes</th></tr></thead>
              <tbody>{history.map((h) => (
                <tr key={h.id}>
                  <td>{h.date}</td>
                  <td><span className={"pill " + (h.status === "Present" ? "Approved" : "Rejected")}>{h.status}</span></td>
                  <td>{h.notes || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StudentEditForm({ pkg, onDone, onCancel }: { pkg: any; onDone: () => void; onCancel: () => void }) {
  const app = useApp();
  const isAdmin = app.role === "admin";
  const [f, setF] = useState({
    student_id: pkg.student_id || "",
    student_name: pkg.student_name || "",
    parent_name: pkg.parent_name || "",
    phone: pkg.phone || "",
    date_of_birth: pkg.date_of_birth || "",
    gender: pkg.gender || "",
    photo_url: pkg.photo_url || "",
    program_id: pkg.program_id || "",
    branch_id: pkg.branch_id || app.branches[0]?.id || "",
    package: pkg.package || "",
    package_size: pkg.package_size || "S",
    base_sessions: pkg.base_sessions || pkg.sessions_total || 16,
    bonus_sessions: pkg.bonus_sessions || 0,
    sessions_total: pkg.sessions_total || 16,
    sessions_used: pkg.sessions_used || 0,
    discount_percent: pkg.discount_percent || 0,
    student_status: pkg.student_status || (pkg.active ? "Active" : "Inactive"),
    admission_date: pkg.admission_date || pkg.start_date || "",
    start_date: pkg.start_date || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Auto-calculate total sessions when base or bonus changes
  function updateSessions(field: string, value: any) {
    const updated = { ...f, [field]: value };
    if (field === "base_sessions" || field === "bonus_sessions") {
      updated.sessions_total = (Number(updated.base_sessions) || 0) + (Number(updated.bonus_sessions) || 0);
    }
    if (field === "package_size" && PKG_SESSIONS[value]) {
      updated.base_sessions = PKG_SESSIONS[value];
      updated.sessions_total = PKG_SESSIONS[value] + (Number(updated.bonus_sessions) || 0);
    }
    setF(updated);
  }

  async function save() {
    setBusy(true); setErr("");
    const payload: any = {
      student_name: f.student_name,
      parent_name: f.parent_name || null,
      phone: f.phone || null,
      date_of_birth: f.date_of_birth || null,
      gender: f.gender || null,
      photo_url: f.photo_url || null,
      program_id: f.program_id || null,
      branch_id: f.branch_id || null,
      package: f.package || null,
      package_size: f.package_size || null,
      base_sessions: Number(f.base_sessions) || 0,
      bonus_sessions: Number(f.bonus_sessions) || 0,
      sessions_total: Number(f.sessions_total) || 0,
      sessions_used: Number(f.sessions_used) || 0,
      discount_percent: Number(f.discount_percent) || 0,
      student_status: f.student_status,
      active: f.student_status !== "Inactive",
      admission_date: f.admission_date || null,
      start_date: f.start_date || null,
    };
    // Only admin can set student_id
    if (isAdmin) {
      payload.student_id = f.student_id || null;
    }
    const { error } = await supabase.from("student_packages").update(payload).eq("id", pkg.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  }

  return (
    <div>
      <button className="btn sm ghost" onClick={onCancel}>← Cancel editing</button>
      <div className="panel">
        <h3>Edit student — {pkg.student_name}</h3>

        {/* Basic info */}
        <div className="frow c3">
          <Field label={isAdmin ? "Student ID" : "Student ID 🔒"} hint={isAdmin ? "Only CEO can change this." : "Only CEO can edit Student ID."}>
            <input value={f.student_id} disabled={!isAdmin} onChange={(e) => setF({ ...f, student_id: e.target.value })} placeholder="e.g. 001" />
          </Field>
          <Field label="Student name *">
            <input value={f.student_name} onChange={(e) => setF({ ...f, student_name: e.target.value })} />
          </Field>
          <Field label="Parent / guardian name">
            <input value={f.parent_name} onChange={(e) => setF({ ...f, parent_name: e.target.value })} />
          </Field>
          <Field label="Phone (with country code)">
            <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+8562055..." />
          </Field>
          <Field label="Date of birth">
            <input type="date" value={f.date_of_birth} onChange={(e) => setF({ ...f, date_of_birth: e.target.value })} />
          </Field>
          <Field label="Gender">
            <select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
          <Field label="Photo URL" hint="Paste a hosted image link.">
            <input value={f.photo_url} onChange={(e) => setF({ ...f, photo_url: e.target.value })} placeholder="https://..." />
          </Field>
        </div>

        {/* Program & branch */}
        <h3 style={{ marginTop: 20 }}>Program & Package</h3>
        <div className="frow c3">
          <Field label="Program">
            <select value={f.program_id} onChange={(e) => setF({ ...f, program_id: e.target.value })}>
              <option value="">—</option>
              {app.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Branch">
            <select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
              {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Package description">
            <input value={f.package} onChange={(e) => setF({ ...f, package: e.target.value })} placeholder="e.g. Spike Prime_S" />
          </Field>
          <Field label="Package size">
            <select value={f.package_size} onChange={(e) => updateSessions("package_size", e.target.value)}>
              <option value="TRIAL">Trial (4)</option>
              <option value="S">Small (16)</option>
              <option value="M">Medium (32)</option>
              <option value="L">Large (48)</option>
              <option value="CAMP">Camp (8)</option>
              <option value="SPECIAL">Special (custom)</option>
            </select>
          </Field>
          <Field label="Base sessions">
            <input type="number" min="0" value={f.base_sessions} onChange={(e) => updateSessions("base_sessions", Number(e.target.value))} />
          </Field>
          <Field label="Bonus sessions (promotion)">
            <input type="number" min="0" value={f.bonus_sessions} onChange={(e) => updateSessions("bonus_sessions", Number(e.target.value))} />
          </Field>
          <Field label="Total sessions">
            <input type="number" value={f.sessions_total} disabled style={{ background: "#f0f0f0", fontWeight: 700 }} />
          </Field>
          <Field label="Sessions used">
            <input type="number" min="0" value={f.sessions_used} onChange={(e) => setF({ ...f, sessions_used: Number(e.target.value) })} />
          </Field>
          <Field label="Discount %">
            <input type="number" min="0" max="100" value={f.discount_percent} onChange={(e) => setF({ ...f, discount_percent: Number(e.target.value) })} placeholder="0" />
          </Field>
        </div>

        {/* Status & dates */}
        <h3 style={{ marginTop: 20 }}>Status & Dates</h3>
        <div className="frow c3">
          <Field label="Student status">
            <select value={f.student_status} onChange={(e) => setF({ ...f, student_status: e.target.value })}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Admission date">
            <input type="date" value={f.admission_date} onChange={(e) => setF({ ...f, admission_date: e.target.value })} />
          </Field>
          <Field label="Package start date">
            <input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
          </Field>
        </div>

        {err && <div className="banner bad" style={{ marginTop: 12 }}>{err}</div>}

        <div className="btnrow" style={{ marginTop: 16 }}>
          <button className="btn" disabled={busy || !f.student_name} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
