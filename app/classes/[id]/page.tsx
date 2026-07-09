"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field } from "@/components/ui";

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export default function ClassDetailPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  return <Shell><ClassDetail /></Shell>;
}

function ClassDetail() {
  const app = useApp();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [cls, setCls] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingRegular, setAddingRegular] = useState(false);
  const [addingMakeup, setAddingMakeup] = useState(false);

  async function reload() {
    if (!id) return;
    setLoading(true);
    const [c, b] = await Promise.all([
      supabase.from("classes").select("*").eq("id", id).maybeSingle(),
      supabase.from("class_bookings").select("*,student_packages(id,student_name,parent_name,phone,sessions_total,sessions_used,active)")
        .eq("class_id", id).eq("status", "Confirmed").order("kind"),
    ]);
    setCls(c.data); setBookings(b.data || []);
    setLoading(false);
  }
  useEffect(() => { reload(); }, [id]);

  if (loading) return <div className="panel"><div className="empty">Loading…</div></div>;
  if (!cls) return (
    <div>
      <button className="btn sm ghost" onClick={() => router.push("/classes")}>← Back</button>
      <div className="panel"><div className="empty">Class not found.</div></div>
    </div>
  );

  const branchName = app.branches.find((b) => b.id === cls.branch_id)?.name || "";
  const programName = app.programs.find((p) => p.id === cls.program_id)?.name || "";
  const regulars = bookings.filter((b) => b.kind === "regular");
  const upcomingMakeups = bookings.filter((b) => b.kind === "makeup" && b.makeup_date >= new Date().toISOString().slice(0,10));

  async function unenroll(bookingId: string) {
    if (!confirm("Remove this student from the class?")) return;
    const { error } = await supabase.from("class_bookings").update({ status: "Cancelled", cancelled_at: new Date().toISOString() }).eq("id", bookingId);
    if (error) { alert(error.message); return; }
    reload();
  }

  return (
    <div>
      <button className="btn sm ghost" onClick={() => router.push("/classes")}>← Back to classes</button>

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ marginBottom: 4 }}>{cls.name}</h3>
            <div style={{ color: "var(--ink2)", fontSize: 13.5 }}>
              {programName || "—"} · {branchName}
              {cls.day_of_week !== null && <> · {DAYS[cls.day_of_week]} {(cls.start_time || "").slice(0,5)}–{(cls.end_time || "").slice(0,5)}</>}
              {cls.room && <> · Room {cls.room}</>}
              {cls.level && <> · {cls.level}</>}
            </div>
          </div>
          <span className={"pill " + (cls.active ? "Approved" : "Rejected")}>{cls.active ? "Active" : "Inactive"}</span>
        </div>

        <div className="cards" style={{ gridTemplateColumns: "repeat(4,1fr)", marginTop: 14 }}>
          <div className="card"><div className="lbl">Regulars</div><div className="val">{regulars.length}</div></div>
          {cls.capacity && <div className={"card " + (regulars.length >= cls.capacity ? "bad" : "ok")}>
            <div className="lbl">Capacity</div><div className="val">{regulars.length}/{cls.capacity}</div></div>}
          <div className="card"><div className="lbl">Upcoming makeups</div><div className="val">{upcomingMakeups.length}</div></div>
          {cls.class_fee && <div className="card"><div className="lbl">Class fee</div><div className="val" style={{ fontSize: 16 }}>{cls.class_fee} {cls.fee_currency}</div></div>}
        </div>
      </div>

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Regular students ({regulars.length})</h3>
          <button className="btn sm" onClick={() => setAddingRegular(!addingRegular)}>+ Enroll student</button>
        </div>

        {addingRegular && <EnrollForm classId={cls.id} kind="regular" onDone={() => { setAddingRegular(false); reload(); }} onCancel={() => setAddingRegular(false)} />}

        {regulars.length === 0 ? <div className="empty">No students enrolled yet.</div> : (
          <div className="tblwrap" style={{ marginTop: 10 }}>
            <table className="tbl">
              <thead><tr><th>Student</th><th>Parent</th><th>Phone</th><th style={{ textAlign: "right" }}>Sessions left</th><th></th></tr></thead>
              <tbody>{regulars.map((b) => {
                const sp = b.student_packages;
                const left = sp ? Math.max(0, sp.sessions_total - sp.sessions_used) : 0;
                return (
                  <tr key={b.id}>
                    <td><b>{sp?.student_name || "—"}</b></td>
                    <td>{sp?.parent_name || "—"}</td>
                    <td>{sp?.phone || "—"}</td>
                    <td className="num">{left}</td>
                    <td><button className="btn sm bad" onClick={() => unenroll(b.id)}>Remove</button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Upcoming makeup bookings ({upcomingMakeups.length})</h3>
          <button className="btn sm ghost" onClick={() => setAddingMakeup(!addingMakeup)}>+ Book makeup</button>
        </div>

        {addingMakeup && <EnrollForm classId={cls.id} kind="makeup" onDone={() => { setAddingMakeup(false); reload(); }} onCancel={() => setAddingMakeup(false)} />}

        {upcomingMakeups.length === 0 ? <div className="empty">No upcoming makeup bookings.</div> : (
          <div className="tblwrap" style={{ marginTop: 10 }}>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Student</th><th>Parent</th><th>Phone</th><th></th></tr></thead>
              <tbody>{upcomingMakeups.map((b) => (
                <tr key={b.id}>
                  <td>{b.makeup_date}</td>
                  <td>{b.student_packages?.student_name}</td>
                  <td>{b.student_packages?.parent_name}</td>
                  <td>{b.student_packages?.phone}</td>
                  <td><button className="btn sm bad" onClick={() => unenroll(b.id)}>Cancel</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function EnrollForm({ classId, kind, onDone, onCancel }: {
  classId: string; kind: "regular" | "makeup";
  onDone: () => void; onCancel: () => void;
}) {
  const app = useApp();
  const [packages, setPackages] = useState<any[]>([]);
  const [pkgId, setPkgId] = useState("");
  const [q, setQ] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.from("student_packages").select("id,student_name,parent_name,phone,sessions_total,sessions_used").eq("active", true).order("student_name").then(({ data }) => setPackages(data || []));
  }, []);

  const visible = packages.filter((p) =>
    !q || `${p.student_name} ${p.parent_name || ""} ${p.phone || ""}`.toLowerCase().includes(q.toLowerCase())
  );

  async function save() {
    if (!pkgId) { setErr("Pick a student first."); return; }
    setBusy(true); setErr("");
    const payload: any = {
      class_id: classId, package_id: pkgId, kind, status: "Confirmed", booked_by: app.userId,
    };
    if (kind === "makeup") payload.makeup_date = date;
    const { error } = await supabase.from("class_bookings").insert(payload);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  }

  return (
    <div style={{ marginTop: 12, padding: 14, background: "#F5F7FB", borderRadius: 12 }}>
      <div className="frow" style={{ marginBottom: 8 }}>
        <input placeholder="Search student…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Field label="Student">
        <select value={pkgId} onChange={(e) => setPkgId(e.target.value)}>
          <option value="">— Select student —</option>
          {visible.map((p) => (
            <option key={p.id} value={p.id}>
              {p.student_name}{p.parent_name ? ` · ${p.parent_name}` : ""} ({Math.max(0, p.sessions_total - p.sessions_used)} left)
            </option>
          ))}
        </select>
      </Field>
      {kind === "makeup" && (
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      )}
      {err && <div className="banner bad" style={{ marginTop: 8 }}>{err}</div>}
      <div className="btnrow">
        <button className="btn sm" disabled={busy || !pkgId} onClick={save}>{busy ? "Saving…" : "Confirm"}</button>
        <button className="btn sm ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
