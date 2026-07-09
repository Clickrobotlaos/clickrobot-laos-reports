"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field } from "@/components/ui";
import { PERMS, todayStr } from "@/lib/util";

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function AttendancePage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  return <Shell><AttendanceView /></Shell>;
}

function AttendanceView() {
  const app = useApp();
  const router = useRouter();
  const [date, setDate] = useState(todayStr());
  const [branch, setBranch] = useState("");
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const dayOfWeek = new Date(date + "T12:00:00").getDay();

  async function reload() {
    setLoading(true);
    const [cls] = await Promise.all([
      supabase.from("classes").select("*, branches(name), programs(name), users!classes_teacher_id_fkey(name)").eq("active", true).eq("day_of_week", dayOfWeek),
    ]);
    setClasses(cls.data || []);
    setLoading(false);
  }
  useEffect(() => { reload(); setSelectedClass(null); }, [date]); // eslint-disable-line

  const branchName = (id: string) => app.branches.find((b) => b.id === id)?.name || "";
  const filteredClasses = classes.filter((c) => !branch || c.branch_id === branch);

  if (selectedClass) {
    return <ClassAttendance cls={selectedClass} date={date} onBack={() => { setSelectedClass(null); reload(); }} />;
  }

  return (
    <div>
      <div className="sectionhead">
        <h2>Attendance — {date === todayStr() ? `Today (${DAYS[dayOfWeek]})` : `${DAYS[dayOfWeek]} ${date}`}</h2>
      </div>

      <div className="frow c2" style={{ marginBottom: 12 }}>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Branch">
          <select value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">All branches</option>
            {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
      </div>

      {loading ? <div className="panel"><div className="empty">Loading…</div></div>
        : filteredClasses.length === 0 ? (
          <div className="panel">
            <div className="empty">
              No classes scheduled for {DAYS[dayOfWeek]}.<br/><br/>
              Go to <b>Classes</b> to add weekly class slots.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredClasses.map((c) => (
              <ClassCard key={c.id} cls={c} date={date} branchName={branchName(c.branch_id)} onClick={() => setSelectedClass(c)} />
            ))}
          </div>
        )}
    </div>
  );
}

function ClassCard({ cls, date, branchName, onClick }: { cls: any; date: string; branchName: string; onClick: () => void }) {
  const [stats, setStats] = useState({ enrolled: 0, present: 0, absent: 0, unmarked: 0 });

  useEffect(() => { (async () => {
    // count regulars + confirmed makeups for this date
    const [regulars, makeups, atts] = await Promise.all([
      supabase.from("class_bookings").select("id,package_id").eq("class_id", cls.id).eq("kind", "regular").eq("status", "Confirmed"),
      supabase.from("class_bookings").select("id,package_id").eq("class_id", cls.id).eq("kind", "makeup").eq("status", "Confirmed").eq("makeup_date", date),
      supabase.from("attendance").select("package_id,status,class_id").eq("date", date).eq("class_id", cls.id),
    ]);
    const attById = new Map<string, string>();
    (atts.data || []).forEach((a: any) => attById.set(a.package_id, a.status));

    const all = new Map<string, string | undefined>();
    (regulars.data || []).forEach((r: any) => all.set(r.package_id, attById.get(r.package_id)));
    (makeups.data || []).forEach((r: any) => all.set(r.package_id, attById.get(r.package_id)));

    let p = 0, a = 0, u = 0;
    all.forEach((s) => {
      if (s === "Present") p++;
      else if (s === "Absent") a++;
      else u++;
    });
    setStats({ enrolled: all.size, present: p, absent: a, unmarked: u });
  })(); }, [cls.id, date]);

  const teacherName = cls.users?.name || "—";
  const capacityStr = cls.capacity ? `${stats.enrolled}/${cls.capacity}` : String(stats.enrolled);

  return (
    <div onClick={onClick} style={{
      background: "#fff", border: "1px solid var(--line)", borderRadius: 16, padding: 16,
      cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
      transition: "transform .1s",
    }}
    onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
    onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 700, fontSize: 15.5 }}>{cls.name}</div>
        <div style={{ color: "var(--ink2)", fontSize: 13, marginTop: 3 }}>
          {(cls.start_time || "").slice(0, 5)}–{(cls.end_time || "").slice(0, 5)} · {branchName}
          {cls.room && <> · Room {cls.room}</>}
          &nbsp;·&nbsp; Teacher: {teacherName}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <span className="pill" style={{ background: "#E0E7FF", color: "#3730A3" }}>👥 {capacityStr} students</span>
          {stats.present > 0 && <span className="pill Approved">✓ {stats.present} present</span>}
          {stats.absent > 0 && <span className="pill Rejected">✗ {stats.absent} absent</span>}
          {stats.unmarked > 0 && <span className="pill Draft">⏱ {stats.unmarked} not marked</span>}
          {stats.enrolled > 0 && stats.unmarked === 0 && <span className="pill Approved">✓ All marked</span>}
        </div>
      </div>
      <div style={{ fontSize: 32, color: "var(--ink2)" }}>→</div>
    </div>
  );
}

function ClassAttendance({ cls, date, onBack }: { cls: any; date: string; onBack: () => void }) {
  const app = useApp();
  const [roster, setRoster] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    const [regulars, makeups, atts] = await Promise.all([
      supabase.from("class_bookings").select("id,kind,package_id,student_packages(id,student_name,parent_name,phone,photo_url,sessions_total,sessions_used)")
        .eq("class_id", cls.id).eq("kind", "regular").eq("status", "Confirmed"),
      supabase.from("class_bookings").select("id,kind,package_id,student_packages(id,student_name,parent_name,phone,photo_url,sessions_total,sessions_used)")
        .eq("class_id", cls.id).eq("kind", "makeup").eq("status", "Confirmed").eq("makeup_date", date),
      supabase.from("attendance").select("id,package_id,status").eq("date", date).eq("class_id", cls.id),
    ]);
    const attByPkg = new Map<string, any>();
    (atts.data || []).forEach((a: any) => attByPkg.set(a.package_id, a));

    const combined: any[] = [];
    (regulars.data || []).forEach((r: any) => combined.push({
      ...r.student_packages, booking_kind: "regular", booking_id: r.id,
      attendance_id: attByPkg.get(r.package_id)?.id ?? null,
      attendance_status: attByPkg.get(r.package_id)?.status ?? null,
    }));
    (makeups.data || []).forEach((r: any) => {
      // avoid duplicating if student is also a regular
      if (combined.find((c) => c.id === r.package_id)) return;
      combined.push({
        ...r.student_packages, booking_kind: "makeup", booking_id: r.id,
        attendance_id: attByPkg.get(r.package_id)?.id ?? null,
        attendance_status: attByPkg.get(r.package_id)?.status ?? null,
      });
    });
    combined.sort((a, b) => (a.student_name || "").localeCompare(b.student_name || ""));
    setRoster(combined);
    setLoading(false);
  }
  useEffect(() => { reload(); }, [cls.id, date]); // eslint-disable-line

  async function setStatus(row: any, status: "Present" | "Absent") {
    setSavingId(row.id);
    if (row.attendance_id && row.attendance_status === status) {
      await supabase.from("attendance").delete().eq("id", row.attendance_id);
    } else if (row.attendance_id) {
      await supabase.from("attendance").update({ status }).eq("id", row.attendance_id);
    } else {
      await supabase.from("attendance").insert({
        package_id: row.id, date, status,
        class_id: cls.id, is_makeup: row.booking_kind === "makeup",
        recorded_by: app.userId,
      });
    }
    reload();
    setSavingId(null);
  }

  const presentCount = roster.filter((r) => r.attendance_status === "Present").length;
  const absentCount = roster.filter((r) => r.attendance_status === "Absent").length;
  const unmarked = roster.length - presentCount - absentCount;

  return (
    <div>
      <button className="btn sm ghost" onClick={onBack}>← Back to classes</button>

      <div className="panel">
        <h3>{cls.name}</h3>
        <div style={{ color: "var(--ink2)", fontSize: 13 }}>
          {DAYS[cls.day_of_week]} {(cls.start_time || "").slice(0, 5)}–{(cls.end_time || "").slice(0, 5)}
          {cls.room && <> · Room {cls.room}</>}
        </div>
        <div className="cards" style={{ gridTemplateColumns: "repeat(4,1fr)", marginTop: 12 }}>
          <div className="card"><div className="lbl">Total</div><div className="val">{roster.length}</div></div>
          <div className="card ok"><div className="lbl">Present</div><div className="val">{presentCount}</div></div>
          <div className="card bad"><div className="lbl">Absent</div><div className="val">{absentCount}</div></div>
          <div className="card"><div className="lbl">Not marked</div><div className="val">{unmarked}</div></div>
        </div>
      </div>

      {loading ? <div className="panel"><div className="empty">Loading roster…</div></div>
        : roster.length === 0 ? (
          <div className="panel">
            <div className="empty">No students enrolled in this class yet. <button className="btn sm ghost" onClick={() => (window.location.href = `/classes/${cls.id}`)}>Manage class</button></div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {roster.map((r) => {
              const left = Math.max(0, r.sessions_total - r.sessions_used);
              const low = left <= 2 && left > 0;
              return (
                <div key={r.id} className="attn-row">
                  <div className="attn-info">
                    {r.photo_url ? (
                      <img src={r.photo_url} alt="" style={{ width: 40, height: 40, borderRadius: 20, objectFit: "cover", marginRight: 10 }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 20, background: "var(--accent2)", color: "var(--accent)", display: "grid", placeItems: "center", fontWeight: 700, marginRight: 10, flexShrink: 0 }}>
                        {(r.student_name || "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="attn-name">
                        {r.student_name}
                        {r.booking_kind === "makeup" && <span className="pill Draft" style={{ marginLeft: 8, fontSize: 10 }}>MAKEUP</span>}
                      </div>
                      <div className="attn-sub">{r.parent_name || ""}{r.phone ? ` · ${r.phone}` : ""}</div>
                      <div className="attn-sess">
                        <span className={"pill " + (left === 0 ? "Rejected" : low ? "Submitted" : "Approved")}>
                          {r.sessions_used}/{r.sessions_total} · {left} left
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="attn-actions">
                    <button className={"btn sm " + (r.attendance_status === "Present" ? "ok" : "ghost")}
                      disabled={savingId === r.id} onClick={() => setStatus(r, "Present")}>
                      ✓ Present
                    </button>
                    <button className={"btn sm " + (r.attendance_status === "Absent" ? "bad" : "ghost")}
                      disabled={savingId === r.id} onClick={() => setStatus(r, "Absent")}>
                      ✗ Absent
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <style>{`
        .attn-row{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}
        .attn-info{flex:1;min-width:220px;display:flex;align-items:center}
        .attn-name{font-weight:700;font-size:15px}
        .attn-sub{color:var(--ink2);font-size:12.5px;margin-top:2px}
        .attn-sess{margin-top:6px}
        .attn-actions{display:flex;gap:6px;flex-wrap:wrap}
        .attn-actions .btn{padding:9px 12px}
      `}</style>
    </div>
  );
}
