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
  const [loading, setLoading] = useState(true);

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
      // Sessions taught this month = distinct class+date pairs with attendance in my classes
      const ids = (cls.data || []).map((c: any) => c.id);
      if (ids.length) {
        const monthStart = new Date().toISOString().slice(0, 7) + "-01";
        const { data: att } = await supabase.from("attendance").select("class_id,date").in("class_id", ids).gte("date", monthStart);
        const uniq = new Set((att || []).map((a: any) => `${a.class_id}|${a.date}`));
        setTaught(uniq.size);
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
        <div className="hint" style={{ marginTop: 8 }}>Leave requests & working hours will appear here once the leave system is added.</div>
      </div>
    </div>
  );
}
