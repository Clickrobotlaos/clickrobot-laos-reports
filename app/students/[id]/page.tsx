"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field } from "@/components/ui";
import { PERMS, copyText } from "@/lib/util";

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
  const can = PERMS[app.role];
  const [pkg, setPkg] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editPhoto, setEditPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [dob, setDob] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  async function reload() {
    if (!id) return;
    setLoading(true);
    const { data: p } = await supabase.from("student_packages").select("*").eq("id", id).maybeSingle();
    setPkg(p);
    setPhotoUrl(p?.photo_url || "");
    setDob(p?.date_of_birth || "");
    const { data: h } = await supabase.from("attendance").select("*").eq("package_id", id).order("date", { ascending: false });
    setHistory(h || []);
    if (p?.invoice_id) {
      const { data: inv } = await supabase.from("invoices").select("*").eq("id", p.invoice_id).maybeSingle();
      setInvoice(inv);
    }
    setLoading(false);
  }
  useEffect(() => { reload(); }, [id]);

  const branchName = pkg ? (app.branches.find((b) => b.id === pkg.branch_id)?.name || "") : "";
  const programName = pkg ? (app.programs.find((p) => p.id === pkg.program_id)?.name || "") : "";

  if (loading) return <div className="panel"><div className="empty">Loading…</div></div>;
  if (!pkg) return (
    <div>
      <button className="btn sm ghost" onClick={() => router.push("/students")}>← Back to students</button>
      <div className="panel"><div className="empty">Student not found.</div></div>
    </div>
  );

  const left = Math.max(0, pkg.sessions_total - pkg.sessions_used);
  const presents = history.filter((h) => h.status === "Present").length;
  const absents = history.filter((h) => h.status === "Absent").length;
  const rate = history.length ? Math.round((presents / history.length) * 100) : 0;

  const portalUrl = typeof window !== "undefined"
    ? `${window.location.origin}/p/${pkg.public_token}`
    : "";
  const waMessage = `Hi ${pkg.parent_name || "Parent"}!

Here's your ClickRobot parent portal for ${pkg.student_name}:
${portalUrl}

You can see:
✓ Sessions remaining
✓ Attendance history
✓ Invoices

Bookmark this link to check anytime!

- ClickRobot Laos`;
  const waLink = pkg.phone
    ? `https://wa.me/${pkg.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(waMessage)}`
    : null;

  async function toggleActive() {
    if (!pkg) return;
    const { error } = await supabase.from("student_packages").update({ active: !pkg.active }).eq("id", pkg.id);
    if (error) { alert(error.message); return; }
    reload();
  }

  async function savePhoto() {
    const { error } = await supabase.from("student_packages")
      .update({ photo_url: photoUrl || null, date_of_birth: dob || null }).eq("id", pkg.id);
    if (error) { alert(error.message); return; }
    setEditPhoto(false);
    reload();
  }

  return (
    <div>
      <button className="btn sm ghost" onClick={() => router.push("/students")}>← Back to students</button>

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
              <h3 style={{ marginBottom: 4 }}>{pkg.student_name}</h3>
              <div style={{ color: "var(--ink2)", fontSize: 13.5 }}>
                {programName} · {branchName}
                {pkg.parent_name && <> · Parent: {pkg.parent_name}</>}
                {pkg.phone && <> · {pkg.phone}</>}
              </div>
            </div>
          </div>
          <div>
            {pkg.active
              ? <span className="pill Approved">Active</span>
              : <span className="pill Rejected">Finished</span>}
          </div>
        </div>

        <div className="cards" style={{ gridTemplateColumns: "repeat(4,1fr)", marginTop: 14 }}>
          <div className="card"><div className="lbl">Package</div><div className="val" style={{ fontSize: 16 }}>{pkg.package || "—"}</div></div>
          <div className="card"><div className="lbl">Total sessions</div><div className="val">{pkg.sessions_total}</div></div>
          <div className="card ok"><div className="lbl">Used</div><div className="val">{pkg.sessions_used}</div></div>
          <div className={"card " + (left === 0 ? "bad" : left <= 2 ? "" : "ok")}>
            <div className="lbl">Remaining</div>
            <div className="val">{left}</div>
          </div>
        </div>

        <div className="btnrow">
          {pkg.phone && (
            <a className="btn sm wa"
               href={`https://wa.me/${pkg.phone.replace(/[^0-9]/g, "")}`}
               target="_blank" rel="noreferrer">
              WhatsApp parent
            </a>
          )}
          {invoice && (
            <button className="btn sm ghost" onClick={() => router.push(`/invoices?open=${invoice.id}`)}>
              View invoice {invoice.invoice_no}
            </button>
          )}
          {can.addRecords && (
            <button className="btn sm ghost" onClick={toggleActive}>
              {pkg.active ? "Mark as finished" : "Reactivate"}
            </button>
          )}
        </div>
      </div>

      {/* Parent portal panel */}
      <div className="panel" style={{ borderColor: "var(--accent)", borderWidth: 2, background: "linear-gradient(135deg, #F5F3FF 0%, #FCE7F3 100%)" }}>
        <h3>🌟 Parent portal link</h3>
        <div className="hint" style={{ marginBottom: 10 }}>
          Send this link to {pkg.parent_name || "the parent"} — they see a colorful dashboard with their child&apos;s sessions, attendance, and invoices. Bookmarkable, no login needed.
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

      {/* Photo panel */}
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>📸 Photo & birthday (shown in parent portal)</h3>
          {!editPhoto && can.addRecords && <button className="btn sm ghost" onClick={() => setEditPhoto(true)}>Edit</button>}
        </div>
        {editPhoto ? (
          <>
            <div className="frow c2" style={{ marginTop: 10 }}>
              <Field label="Photo URL" hint="Paste a hosted image link (e.g. from Google Drive or WhatsApp).">
                <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://..." />
              </Field>
              <Field label="Date of birth (optional)">
                <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </Field>
            </div>
            <div className="btnrow">
              <button className="btn" onClick={savePhoto}>Save</button>
              <button className="btn ghost" onClick={() => { setEditPhoto(false); setPhotoUrl(pkg.photo_url || ""); setDob(pkg.date_of_birth || ""); }}>Cancel</button>
            </div>
          </>
        ) : (
          <div className="hint" style={{ marginTop: 10 }}>
            {pkg.photo_url ? `Photo set ✓` : "No photo yet."} {pkg.date_of_birth ? `· DOB: ${pkg.date_of_birth}` : ""}
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Attendance summary</h3>
        <div className="cards" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <div className="card ok"><div className="lbl">Attended</div><div className="val">{presents}</div></div>
          <div className="card bad"><div className="lbl">Absent</div><div className="val">{absents}</div></div>
          <div className="card"><div className="lbl">Attendance rate</div><div className="val">{rate}%</div></div>
        </div>
      </div>

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
