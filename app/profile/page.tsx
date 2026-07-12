"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { fmt, ROLE_LABELS } from "@/lib/util";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function ProfilePage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  return <Shell><PortalView /></Shell>;
}

function PortalView() {
  const app = useApp();
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [myClasses, setMyClasses] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [taught, setTaught] = useState(0);
  const [myStudents, setMyStudents] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [leaveRules, setLeaveRules] = useState<any>({ annual_days: 12, sick_days: 30 });
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadLeaves() {
    const [{ data: lv }, { data: rules }] = await Promise.all([
      supabase.from("leave_requests").select("*").eq("user_id", app.userId).order("created_at", { ascending: false }).limit(20),
      supabase.from("settings").select("value").eq("key", "leave_rules").maybeSingle(),
    ]);
    setLeaves(lv || []);
    if (rules?.value) setLeaveRules(rules.value);
  }

  useEffect(() => {
    (async () => {
      const [u, cls, pay] = await Promise.all([
        supabase.from("users").select("*").eq("id", app.userId).maybeSingle(),
        supabase.from("classes").select("*").eq("teacher_id", app.userId).eq("active", true).order("day_of_week").order("start_time"),
        supabase.from("salary_payroll").select("*").eq("user_id", app.userId).order("month", { ascending: false }).limit(12),
      ]);
      setMe(u.data);
      setMyClasses(cls.data || []);
      setPayslips(pay.data || []);
      loadLeaves();
      // Sessions taught this month = distinct class+date pairs with attendance in my classes
      const ids = (cls.data || []).map((c: any) => c.id);
      if (ids.length) {
        const monthStart = new Date().toISOString().slice(0, 7) + "-01";
        const [{ data: att }, { data: bookings }] = await Promise.all([
          supabase.from("attendance").select("class_id,date").in("class_id", ids).gte("date", monthStart),
          supabase.from("class_bookings").select("class_id,student_packages(id,student_name,parent_name,phone,photo_url,sessions_total,sessions_used,student_status)").in("class_id", ids).eq("kind", "regular").eq("status", "Confirmed"),
        ]);
        const uniq = new Set((att || []).map((a: any) => `${a.class_id}|${a.date}`));
        setTaught(uniq.size);
        setMyStudents(bookings || []);
      }
      setLoading(false);
    })();
  }, [app.userId]);

  if (loading) return <div className="panel"><div className="empty">Loading…</div></div>;

  const branchName = (id: string) => app.branches.find((b) => b.id === id)?.name || "";
  const programName = (id: string) => app.programs.find((p) => p.id === id)?.name || "";
  const todayDow = new Date().getDay();
  const todayClasses = myClasses.filter((c) => c.day_of_week === todayDow);

  return (
    <div>
      <div className="sectionhead"><h2>👤 My Portal</h2></div>

      {/* My info card */}
      <div className="panel" style={{ background: "linear-gradient(135deg, var(--accent2), #fff)" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: "var(--accent)", color: "white", display: "grid", placeItems: "center", fontSize: 26, fontWeight: 700 }}>
            {(app.userName || "?").slice(0, 1).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ marginBottom: 2 }}>{app.userName}</h3>
            <div style={{ fontSize: 13.5, color: "var(--ink2)" }}>
              {me?.position || ROLE_LABELS[app.role] || app.role}
              {me?.branch_id && <> · {branchName(me.branch_id)}</>}
              {me?.start_date && <> · Since {me.start_date}</>}
            </div>
          </div>
          <button className="btn sm ghost" onClick={() => router.push(`/staff/${app.userId}`)}>Edit my profile →</button>
        </div>
        <div className="cards" style={{ gridTemplateColumns: "repeat(3,1fr)", marginTop: 14 }}>
          <div className="card"><div className="lbl">My classes</div><div className="val">{myClasses.length}</div></div>
          <div className="card ok"><div className="lbl">Sessions taught this month</div><div className="val">{taught}</div></div>
          <div className="card"><div className="lbl">Contract</div><div className="val" style={{ fontSize: 14 }}>{me?.contract_end_date ? `until ${me.contract_end_date}` : me?.employment_type || "—"}</div></div>
        </div>
      </div>

      {/* Today's classes */}
      {todayClasses.length > 0 && (
        <div className="panel" style={{ borderColor: "#86EFAC", borderWidth: 2 }}>
          <h3 style={{ color: "#15803D" }}>📅 My classes TODAY ({DAYS[todayDow]})</h3>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {todayClasses.map((c) => (
              <div key={c.id} style={{ padding: 12, background: "#F0FDF4", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <b>{c.name}</b>
                  <div style={{ fontSize: 12.5, color: "var(--ink2)" }}>
                    {(c.start_time || "").slice(0, 5)}–{(c.end_time || "").slice(0, 5)} · {branchName(c.branch_id)}{c.room ? ` · Room ${c.room}` : ""}
                  </div>
                </div>
                <button className="btn sm ok" onClick={() => router.push("/attendance")}>Mark attendance →</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly schedule */}
      <div className="panel">
        <h3>🗓️ My weekly classes ({myClasses.length})</h3>
        {myClasses.length === 0 ? <div className="empty">No classes assigned to you yet.</div> : (
          <div className="tblwrap" style={{ marginTop: 8 }}>
            <table className="tbl" style={{ fontSize: 13.5 }}>
              <thead><tr><th>Day</th><th>Time</th><th>Class</th><th>Program</th><th>Branch</th><th>Room</th></tr></thead>
              <tbody>{myClasses.map((c) => (
                <tr key={c.id} style={{ background: c.day_of_week === todayDow ? "var(--accent2)" : undefined }}>
                  <td><b>{c.day_of_week !== null ? DAYS[c.day_of_week].slice(0, 3) : "—"}</b>{c.day_of_week === todayDow && " (today)"}</td>
                  <td>{(c.start_time || "").slice(0, 5)}–{(c.end_time || "").slice(0, 5)}</td>
                  <td>{c.name}</td>
                  <td>{programName(c.program_id) || "—"}</td>
                  <td>{branchName(c.branch_id)}</td>
                  <td>{c.room || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* My payslips */}
      <div className="panel">
        <h3>💳 My payslips</h3>
        {payslips.length === 0 ? <div className="empty">No payslips yet.</div> : (
          <div className="tblwrap" style={{ marginTop: 8 }}>
            <table className="tbl" style={{ fontSize: 13.5 }}>
              <thead><tr><th>Month</th><th style={{ textAlign: "right" }}>Net pay</th><th>Status</th><th>Slip</th></tr></thead>
              <tbody>{payslips.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.month}</b></td>
                  <td className="num">{fmt(p.net || 0, p.currency)} {p.currency}</td>
                  <td><span className={"pill " + (p.status === "Paid" ? "Approved" : "Draft")}>{p.status}</span></td>
                  <td>{p.slip_no || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* 👨‍👩‍👧 My students */}
      {myStudents.length > 0 && (
        <div className="panel">
          <h3>👨‍👩‍👧 My students ({myStudents.length})</h3>
          {myClasses.map((c: any) => {
            const kids = myStudents.filter((b: any) => b.class_id === c.id && b.student_packages);
            if (kids.length === 0) return null;
            return (
              <div key={c.id} style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--accent)", marginBottom: 6 }}>
                  {c.name} · {kids.length} student{kids.length > 1 ? "s" : ""}
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {kids.map((b: any) => {
                    const s = b.student_packages;
                    const left = Math.max(0, (s.sessions_total || 0) - (s.sessions_used || 0));
                    const waMsg = `Hi ${s.parent_name || "Parent"}! 🤖 Today ${s.student_name} did great in ${c.name}! Today we practiced: \n\nSee photos below! 📸\n– Teacher ${app.userName || ""}, ClickRobot Laos`;
                    const waHref = s.phone ? `https://wa.me/${s.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(waMsg)}` : null;
                    return (
                      <div key={s.id} style={{ padding: 8, background: "#F8FAFD", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          {s.photo_url ? (
                            <img src={s.photo_url} alt="" style={{ width: 34, height: 34, borderRadius: 17, objectFit: "cover" }} />
                          ) : (
                            <div style={{ width: 34, height: 34, borderRadius: 17, background: "var(--accent2)", color: "var(--accent)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                              {(s.student_name || "?").slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <b style={{ fontSize: 13.5 }}>{s.student_name}</b>
                            <span className={"pill " + (left === 0 ? "Rejected" : left <= 2 ? "Submitted" : "Approved")} style={{ marginLeft: 6, fontSize: 10 }}>{left} left</span>
                          </div>
                        </div>
                        {waHref && <a className="btn sm wa" href={waHref} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>📱 Send class update</a>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="hint" style={{ marginTop: 10 }}>
            💡 &quot;Send class update&quot; opens WhatsApp with a ready message — just fill in what you practiced and attach photos before sending.
          </div>
        </div>
      )}

      {/* 🏖️ My leave */}
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0 }}>🏖️ My leave</h3>
          <button className="btn sm" onClick={() => setShowLeaveForm(!showLeaveForm)}>+ Request leave</button>
        </div>

        {/* Balance */}
        {(() => {
          const year = new Date().getFullYear();
          const approvedThisYear = leaves.filter((l) => l.status === "Approved" && (l.start_date || "").startsWith(String(year)));
          const usedAnnual = approvedThisYear.filter((l) => l.leave_type === "Annual").reduce((s, l) => s + Number(l.days || 0), 0);
          const usedSick = approvedThisYear.filter((l) => l.leave_type === "Sick").reduce((s, l) => s + Number(l.days || 0), 0);
          return (
            <div className="cards" style={{ gridTemplateColumns: "repeat(2,1fr)", marginTop: 10 }}>
              <div className="card"><div className="lbl">Annual leave {year}</div><div className="val">{usedAnnual}/{leaveRules.annual_days}</div><div className="sub">{Math.max(0, leaveRules.annual_days - usedAnnual)} days left</div></div>
              <div className="card"><div className="lbl">Sick leave {year}</div><div className="val">{usedSick}/{leaveRules.sick_days}</div><div className="sub">{Math.max(0, leaveRules.sick_days - usedSick)} days left</div></div>
            </div>
          );
        })()}

        {showLeaveForm && (
          <LeaveForm userId={app.userId!} userName={app.userName || ""} onDone={() => { setShowLeaveForm(false); loadLeaves(); }} onCancel={() => setShowLeaveForm(false)} />
        )}

        {/* History */}
        {leaves.length === 0 ? <div className="empty" style={{ marginTop: 10 }}>No leave requests yet.</div> : (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {leaves.map((l) => (
              <div key={l.id} style={{ padding: 10, background: "#F8FAFD", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <b style={{ fontSize: 13.5 }}>{l.leave_type}</b>
                  <span style={{ fontSize: 12.5, color: "var(--ink2)" }}> · {l.start_date}{l.end_date !== l.start_date ? ` → ${l.end_date}` : ""} · {l.days} day{Number(l.days) !== 1 ? "s" : ""}</span>
                  {l.reason && <div style={{ fontSize: 12, color: "var(--ink2)", marginTop: 2 }}>{l.reason}</div>}
                  {l.review_note && <div style={{ fontSize: 12, color: "#B45309", marginTop: 2 }}>Note: {l.review_note}</div>}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className={"pill " + (l.status === "Approved" ? "Approved" : l.status === "Rejected" ? "Rejected" : l.status === "Cancelled" ? "Rejected" : "Submitted")}>{l.status}</span>
                  {l.status === "Pending" && (
                    <button className="btn sm ghost" onClick={async () => {
                      await supabase.from("leave_requests").update({ status: "Cancelled" }).eq("id", l.id);
                      loadLeaves();
                    }}>Cancel</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LeaveForm({ userId, userName, onDone, onCancel }: { userId: string; userName: string; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ leave_type: "Annual", start_date: "", end_date: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const days = (() => {
    if (!f.start_date || !f.end_date) return 0;
    const s = new Date(f.start_date).getTime(), e = new Date(f.end_date).getTime();
    if (e < s) return 0;
    return Math.round((e - s) / 86400000) + 1;
  })();

  async function save() {
    setBusy(true); setErr("");
    const { error } = await supabase.from("leave_requests").insert({
      user_id: userId, user_name: userName,
      leave_type: f.leave_type, start_date: f.start_date, end_date: f.end_date,
      days, reason: f.reason || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  }

  return (
    <div style={{ marginTop: 12, padding: 14, background: "#F0F9FF", borderRadius: 12, border: "1.5px solid #7DD3FC" }}>
      <div className="frow c3">
        <div className="field">
          <label>Leave type</label>
          <select value={f.leave_type} onChange={(e) => setF({ ...f, leave_type: e.target.value })}>
            <option>Annual</option><option>Sick</option><option>Emergency</option><option>Unpaid</option><option>Other</option>
          </select>
        </div>
        <div className="field"><label>From</label><input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value, end_date: f.end_date || e.target.value })} /></div>
        <div className="field"><label>To</label><input type="date" value={f.end_date} min={f.start_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></div>
      </div>
      {days > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "#0369A1", marginBottom: 8 }}>= {days} day{days > 1 ? "s" : ""}</div>}
      <div className="field"><label>Reason</label><textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Brief reason for your leave…" /></div>
      {err && <div className="banner bad">{err}</div>}
      <div className="btnrow" style={{ marginTop: 8 }}>
        <button className="btn sm" disabled={busy || !f.start_date || !f.end_date || days === 0} onClick={save}>{busy ? "Sending…" : "📨 Submit request"}</button>
        <button className="btn sm ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
