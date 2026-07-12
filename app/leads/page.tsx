"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field, Sel } from "@/components/ui";
import { todayStr } from "@/lib/util";

const SOURCES = ["Facebook", "Walk-in", "Referral", "Phone", "Other"];
const LOST_REASONS = ["Too expensive", "Too far", "No response", "Chose another school", "Wrong age", "Other"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const STALE_DAYS = 2;

const STAGES = [
  { key: "New", label: "New", emoji: "📥" },
  { key: "Contacted", label: "Contacted", emoji: "📞" },
  { key: "TrialBooked", label: "Trial Booked", emoji: "📅" },
  { key: "TrialAttended", label: "Trial Attended", emoji: "✅" },
  { key: "Registered", label: "Registered", emoji: "🎉" },
  { key: "Lost", label: "Lost", emoji: "❌" },
];

type Mode = "home" | "new" | "book" | "checkin" | "detail" | "all";

export default function LeadsPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  return <Shell><LeadsView /></Shell>;
}

function LeadsView() {
  const app = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("home");
  const [selected, setSelected] = useState<any>(null);
  const [bookLead, setBookLead] = useState<any>(null); // lead being booked for trial

  async function reload() {
    setLoading(true);
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  const t = todayStr();
  const programName = (id: string) => app.programs.find((p) => p.id === id)?.name || "—";

  function isStale(l: any) {
    if (l.status !== "New" && l.status !== "Contacted") return false;
    const last = new Date(l.last_contact_at || l.created_at).getTime();
    return Date.now() - last > STALE_DAYS * 24 * 3600 * 1000;
  }

  const staleLeads = rows.filter(isStale);
  const trialsToday = rows.filter((r) => r.trial_date === t && r.status === "TrialBooked");
  const needAction = rows.filter((r) => r.status === "New" || r.status === "Contacted");

  // Month stats
  const monthStart = t.slice(0, 7);
  const monthLeads = rows.filter((r) => (r.created_at || "").slice(0, 7) === monthStart);
  const monthTrials = monthLeads.filter((r) => ["TrialBooked", "TrialAttended", "Registered"].includes(r.status)).length;
  const monthReg = monthLeads.filter((r) => r.status === "Registered").length;

  async function quickLog(lead: any) {
    await supabase.from("leads").update({ status: lead.status === "New" ? "Contacted" : lead.status, last_contact_at: new Date().toISOString() }).eq("id", lead.id);
    await supabase.from("lead_activities").insert({ lead_id: lead.id, action: "Contacted", by_user: app.userId, by_name: app.userName });
    reload();
  }

  const wa = (phone: string) => `https://wa.me/${(phone || "").replace(/[^0-9]/g, "")}`;

  // ============ SUB-VIEWS ============
  if (mode === "new") return <div><BackBtn onClick={() => setMode("home")} /><InquiryForm onDone={() => { setMode("home"); reload(); }} onCancel={() => setMode("home")} /></div>;
  if (mode === "book") return <div><BackBtn onClick={() => { setMode("home"); setBookLead(null); }} /><BookTrialFlow leads={needAction} preselected={bookLead} onDone={() => { setMode("home"); setBookLead(null); reload(); }} /></div>;
  if (mode === "checkin") return <div><BackBtn onClick={() => setMode("home")} /><TrialCheckin trials={trialsToday} onDone={reload} programName={programName} /></div>;
  if (mode === "detail" && selected) return <div><BackBtn onClick={() => { setMode("home"); setSelected(null); }} /><LeadDetail lead={selected} onChanged={reload} onBook={(l: any) => { setBookLead(l); setMode("book"); }} /></div>;
  if (mode === "all") return <div><BackBtn onClick={() => setMode("home")} /><AllLeads rows={rows} programName={programName} isStale={isStale} onOpen={(l: any) => { setSelected(l); setMode("detail"); }} /></div>;

  // ============ HOME ============
  return (
    <div>
      <div className="sectionhead"><h2>🎯 Leads & Trials</h2></div>

      {/* BIG ACTION BUTTONS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
        <BigBtn emoji="📥" label="New Inquiry" sub="Parent messaged us" bg="linear-gradient(135deg,#F97316,#EA580C)" onClick={() => setMode("new")} />
        <BigBtn emoji="📅" label="Book Trial" sub="Pick class & date" bg="linear-gradient(135deg,#8B5CF6,#6D28D9)" onClick={() => setMode("book")} />
        <BigBtn emoji="✅" label="Today's Trials" sub={trialsToday.length ? `${trialsToday.length} to check in` : "None today"} bg="linear-gradient(135deg,#22C55E,#15803D)" badge={trialsToday.length} onClick={() => setMode("checkin")} />
      </div>

      {/* NEED FOLLOW-UP */}
      {staleLeads.length > 0 && (
        <div className="panel" style={{ borderColor: "#FCA5A5", borderWidth: 2 }}>
          <h3 style={{ color: "#B91C1C" }}>⚠️ Need follow-up ({staleLeads.length})</h3>
          <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
            {staleLeads.map((l) => (
              <div key={l.id} style={{ padding: 12, background: "#FFF7F7", borderRadius: 12, border: "1px solid #FECACA" }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <div style={{ cursor: "pointer" }} onClick={() => { setSelected(l); setMode("detail"); }}>
                    <b>{l.student_name}</b>{l.age && <span style={{ color: "var(--ink2)", fontSize: 13 }}> · {l.age} yrs</span>}
                    <div style={{ fontSize: 12.5, color: "var(--ink2)" }}>{l.parent_name || ""} {l.phone ? `· ${l.phone}` : ""} · {programName(l.program_id)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {l.phone && <a className="btn sm wa" href={wa(l.phone)} target="_blank" rel="noreferrer">📱</a>}
                    <button className="btn sm ghost" onClick={() => quickLog(l)}>📞 Log</button>
                    <button className="btn sm" onClick={() => { setBookLead(l); setMode("book"); }}>📅 Trial</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TRIALS TODAY inline */}
      {trialsToday.length > 0 && (
        <div className="panel" style={{ borderColor: "#86EFAC", borderWidth: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, color: "#15803D" }}>📅 Trials today ({trialsToday.length})</h3>
            <button className="btn sm ok" onClick={() => setMode("checkin")}>Open check-in →</button>
          </div>
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            {trialsToday.map((l) => (
              <div key={l.id} style={{ fontSize: 13.5, padding: 8, background: "#F0FDF4", borderRadius: 8 }}>
                <b>{l.student_name}</b> · {programName(l.program_id)} {l.phone && <>· {l.phone}</>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active leads quick list */}
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Working on ({needAction.length})</h3>
          <button className="btn sm ghost" onClick={() => setMode("all")}>All leads & pipeline →</button>
        </div>
        {loading ? <div className="empty">Loading…</div>
          : needAction.length === 0 ? <div className="empty">No open leads. Tap 📥 New Inquiry when a parent contacts you!</div>
            : (
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {needAction.slice(0, 8).map((l) => (
                  <div key={l.id} onClick={() => { setSelected(l); setMode("detail"); }}
                    style={{ padding: 10, background: "#F8FAFD", borderRadius: 10, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <b style={{ fontSize: 14 }}>{l.student_name}</b>
                      <span style={{ fontSize: 12.5, color: "var(--ink2)" }}> · {programName(l.program_id)} · {l.source}</span>
                    </div>
                    <span className="pill Draft" style={{ fontSize: 10.5 }}>{STAGES.find((s) => s.key === l.status)?.emoji} {l.status}</span>
                  </div>
                ))}
              </div>
            )}
      </div>

      {/* Month stats line */}
      <div style={{ textAlign: "center", fontSize: 13, color: "var(--ink2)", padding: "8px 0" }}>
        📊 This month: <b>{monthLeads.length}</b> inquiries → <b>{monthTrials}</b> trials → <b style={{ color: "#16A34A" }}>{monthReg}</b> registered
        {monthLeads.length > 0 && <> ({Math.round((monthReg / monthLeads.length) * 100)}% conversion)</>}
      </div>
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return <button className="btn sm ghost" style={{ marginBottom: 10 }} onClick={onClick}>← Back to Leads home</button>;
}

function BigBtn({ emoji, label, sub, bg, badge, onClick }: any) {
  return (
    <button onClick={onClick} style={{
      position: "relative", border: "none", cursor: "pointer", borderRadius: 18,
      background: bg, color: "white", padding: "22px 12px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      boxShadow: "0 4px 16px rgba(0,0,0,0.15)", transition: "transform .1s",
    }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
      {badge > 0 && <span style={{ position: "absolute", top: 8, right: 10, background: "white", color: "#DC2626", borderRadius: 12, padding: "2px 8px", fontSize: 12, fontWeight: 800 }}>{badge}</span>}
      <span style={{ fontSize: 40 }}>{emoji}</span>
      <span style={{ fontSize: 16, fontWeight: 800 }}>{label}</span>
      <span style={{ fontSize: 11.5, opacity: 0.9 }}>{sub}</span>
    </button>
  );
}

function InquiryForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const app = useApp();
  const [f, setF] = useState({ student_name: "", parent_name: "", phone: "", age: "", program_id: app.programs[0]?.id || "", branch_id: app.branches[0]?.id || "", source: "Facebook", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    setBusy(true); setErr("");
    const { data, error } = await supabase.from("leads").insert({
      student_name: f.student_name, parent_name: f.parent_name || null, phone: f.phone || null,
      age: Number(f.age) || null, program_id: f.program_id || null, branch_id: f.branch_id || null,
      source: f.source, notes: f.notes || null, created_by: app.userId,
    }).select("id").single();
    if (!error && data) await supabase.from("lead_activities").insert({ lead_id: data.id, action: "Created", note: `Inquiry via ${f.source}`, by_user: app.userId, by_name: app.userName });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onDone();
  }
  return (
    <div className="panel" style={{ borderColor: "#F97316", borderWidth: 2 }}>
      <h3>📥 New inquiry</h3>
      <div className="frow c3">
        <Field label="Student name *"><input value={f.student_name} onChange={(e) => setF({ ...f, student_name: e.target.value })} autoFocus /></Field>
        <Field label="Parent name"><input value={f.parent_name} onChange={(e) => setF({ ...f, parent_name: e.target.value })} /></Field>
        <Field label="Phone (WhatsApp)"><input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+85620..." /></Field>
        <Field label="Age"><input type="number" inputMode="numeric" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} /></Field>
        <Field label="Interested course"><select value={f.program_id} onChange={(e) => setF({ ...f, program_id: e.target.value })}>{app.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Branch"><select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>{app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Source"><Sel value={f.source} options={SOURCES} onChange={(v) => setF({ ...f, source: v })} /></Field>
      </div>
      <Field label="Notes"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="What did the parent ask?" /></Field>
      {err && <div className="banner bad">{err}</div>}
      <div className="btnrow">
        <button className="btn" disabled={busy || !f.student_name} onClick={save}>{busy ? "Saving…" : "💾 Save inquiry"}</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ============ BOOK TRIAL FLOW — pick lead → date → visual class cards ============
function BookTrialFlow({ leads, preselected, onDone }: { leads: any[]; preselected?: any; onDone: () => void }) {
  const app = useApp();
  const [lead, setLead] = useState<any>(preselected || null);
  const [q, setQ] = useState("");
  const [date, setDate] = useState(todayStr());
  const [classes, setClasses] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, { filled: number; trials: number }>>({});
  const [maxTrials, setMaxTrials] = useState(2);
  const [busy, setBusy] = useState(false);
  const [booked, setBooked] = useState<any>(null);

  useEffect(() => {
    supabase.from("settings").select("value").eq("key", "trial_rules").maybeSingle().then(({ data }) => {
      const v: any = data?.value;
      if (v?.max_per_class) setMaxTrials(Number(v.max_per_class));
    });
  }, []);

  const dow = new Date(date + "T12:00:00").getDay();

  useEffect(() => {
    (async () => {
      const { data: cls } = await supabase.from("classes").select("*, users!classes_teacher_id_fkey(name)").eq("active", true).eq("day_of_week", dow).order("start_time");
      setClasses(cls || []);
      const map: Record<string, { filled: number; trials: number }> = {};
      for (const c of cls || []) {
        const [regs, mk, tr] = await Promise.all([
          supabase.from("class_bookings").select("id", { count: "exact", head: true }).eq("class_id", c.id).eq("kind", "regular").eq("status", "Confirmed"),
          supabase.from("class_bookings").select("id", { count: "exact", head: true }).eq("class_id", c.id).eq("kind", "makeup").eq("status", "Confirmed").eq("makeup_date", date),
          supabase.from("leads").select("id", { count: "exact", head: true }).eq("trial_class_id", c.id).eq("trial_date", date).eq("status", "TrialBooked"),
        ]);
        map[c.id] = { filled: (regs.count || 0) + (mk.count || 0) + (tr.count || 0), trials: tr.count || 0 };
      }
      setCounts(map);
    })();
  }, [date, dow]);

  async function book(cls: any) {
    if (!lead) return;
    setBusy(true);
    await supabase.from("leads").update({ status: "TrialBooked", trial_class_id: cls.id, trial_date: date, trial_result: null, last_contact_at: new Date().toISOString() }).eq("id", lead.id);
    await supabase.from("lead_activities").insert({ lead_id: lead.id, action: "Trial booked", note: `${cls.name} on ${date}`, by_user: app.userId, by_name: app.userName });
    setBusy(false);
    setBooked({ cls, date });
  }

  const branchName = (id: string) => app.branches.find((b) => b.id === id)?.name || "";

  // ===== Confirmation screen with WhatsApp =====
  if (booked && lead) {
    const msg = `Hi ${lead.parent_name || "Parent"}! 🤖\n\nTrial class confirmed for ${lead.student_name}:\n📅 ${DAYS[dow]}, ${booked.date}\n🕙 ${(booked.cls.start_time || "").slice(0, 5)}–${(booked.cls.end_time || "").slice(0, 5)}\n🏫 ${booked.cls.name}\n📍 ${branchName(booked.cls.branch_id)}\n\nSee you there!\n- ClickRobot Laos`;
    const waLink = lead.phone ? `https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(msg)}` : null;
    return (
      <div className="panel" style={{ textAlign: "center", padding: 30, background: "linear-gradient(135deg,#F0FDF4,#DCFCE7)", border: "2px solid #86EFAC" }}>
        <div style={{ fontSize: 56 }}>🎉</div>
        <h2 style={{ color: "#15803D" }}>Trial booked!</h2>
        <p style={{ fontSize: 15 }}><b>{lead.student_name}</b> — {booked.cls.name}<br />{DAYS[dow]}, {booked.date} at {(booked.cls.start_time || "").slice(0, 5)}</p>
        <div className="btnrow" style={{ justifyContent: "center", marginTop: 14 }}>
          {waLink && <a className="btn wa" href={waLink} target="_blank" rel="noreferrer">📱 Send confirmation to parent</a>}
          <button className="btn ghost" onClick={onDone}>Done</button>
        </div>
      </div>
    );
  }

  // ===== Step 1: pick lead =====
  if (!lead) {
    const visible = leads.filter((l) => !q || `${l.student_name} ${l.parent_name || ""} ${l.phone || ""}`.toLowerCase().includes(q.toLowerCase()));
    return (
      <div className="panel" style={{ borderColor: "#8B5CF6", borderWidth: 2 }}>
        <h3>📅 Book trial — Step 1: Who is it for?</h3>
        <input placeholder="Search inquiry by name or phone…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
        {visible.length === 0 ? (
          <div className="empty">No open inquiries found. Add a 📥 New Inquiry first, then book the trial.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {visible.map((l) => (
              <button key={l.id} onClick={() => setLead(l)} style={{ textAlign: "left", padding: 12, borderRadius: 12, border: "1.5px solid var(--line)", background: "white", cursor: "pointer" }}>
                <b>{l.student_name}</b>{l.age ? ` · ${l.age} yrs` : ""}
                <div style={{ fontSize: 12.5, color: "var(--ink2)" }}>{l.parent_name || ""} {l.phone ? `· ${l.phone}` : ""}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ===== Step 2: date + visual class cards =====
  return (
    <div className="panel" style={{ borderColor: "#8B5CF6", borderWidth: 2 }}>
      <h3>📅 Book trial for <span style={{ color: "#6D28D9" }}>{lead.student_name}</span></h3>
      <Field label="Trial date">
        <input type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)} style={{ fontSize: 16 }} />
      </Field>
      <div style={{ fontSize: 13.5, color: "var(--ink2)", margin: "6px 0 12px" }}>Classes on <b>{DAYS[dow]}</b>:</div>

      {classes.length === 0 ? (
        <div className="empty">No classes run on {DAYS[dow]}. Pick another date.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {classes.map((c) => {
            const cnt = counts[c.id] || { filled: 0, trials: 0 };
            const cap = c.capacity || 0;
            const seatFull = cap > 0 && cnt.filled >= cap;
            const trialFull = cnt.trials >= maxTrials;
            const blocked = seatFull || trialFull;
            const free = cap > 0 ? cap - cnt.filled : null;
            return (
              <div key={c.id} style={{
                padding: 14, borderRadius: 14, background: blocked ? "#FAFAFA" : "white",
                border: blocked ? "1.5px solid #E5E7EB" : "2px solid #C4B5FD", opacity: blocked ? 0.7 : 1,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  <div>
                    <b style={{ fontSize: 15 }}>{c.name}</b>
                    <div style={{ fontSize: 12.5, color: "var(--ink2)", marginTop: 2 }}>
                      {(c.start_time || "").slice(0, 5)}–{(c.end_time || "").slice(0, 5)} · {branchName(c.branch_id)}
                      {c.users?.name && <> · {c.users.name}</>}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      {seatFull
                        ? <span className="pill Rejected">🔴 FULL {cnt.filled}/{cap}</span>
                        : trialFull
                          ? <span className="pill Submitted">⚠️ Max {maxTrials} trials reached</span>
                          : cap > 0
                            ? <span className="pill Approved">🟢 {cnt.filled}/{cap} filled · {free} slot{free !== 1 ? "s" : ""} free</span>
                            : <span className="pill Approved">🟢 {cnt.filled} students (no limit)</span>}
                      {cnt.trials > 0 && !trialFull && <span className="pill Draft" style={{ marginLeft: 6 }}>{cnt.trials} trial{cnt.trials > 1 ? "s" : ""} booked</span>}
                    </div>
                  </div>
                  <button className="btn" disabled={busy || blocked} onClick={() => book(c)}
                    style={{ background: blocked ? undefined : "linear-gradient(135deg,#8B5CF6,#6D28D9)", minWidth: 130 }}>
                    {blocked ? "Not available" : "Book trial here"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button className="btn sm ghost" style={{ marginTop: 12 }} onClick={() => setLead(null)}>← Change student</button>
    </div>
  );
}

// ============ TRIAL CHECK-IN ============
function TrialCheckin({ trials, onDone, programName }: { trials: any[]; onDone: () => void; programName: (id: string) => string }) {
  const app = useApp();
  const [items, setItems] = useState(trials);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function mark(l: any, attended: boolean) {
    setBusyId(l.id);
    if (attended) {
      await supabase.from("leads").update({ status: "TrialAttended", trial_result: "Attended", last_contact_at: new Date().toISOString() }).eq("id", l.id);
      await supabase.from("lead_activities").insert({ lead_id: l.id, action: "Trial attended", by_user: app.userId, by_name: app.userName });
    } else {
      await supabase.from("leads").update({ status: "Contacted", trial_result: "NoShow", trial_class_id: null, trial_date: null, last_contact_at: new Date().toISOString() }).eq("id", l.id);
      await supabase.from("lead_activities").insert({ lead_id: l.id, action: "Trial no-show", note: "Back to follow-up", by_user: app.userId, by_name: app.userName });
    }
    setItems(items.filter((x) => x.id !== l.id));
    setBusyId(null);
    onDone();
  }

  return (
    <div className="panel" style={{ borderColor: "#86EFAC", borderWidth: 2 }}>
      <h3 style={{ color: "#15803D" }}>✅ Trial check-in — today</h3>
      {items.length === 0 ? <div className="empty">All trials checked in! 🎉</div> : (
        <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
          {items.map((l) => (
            <div key={l.id} style={{ padding: 16, borderRadius: 14, background: "#F8FFF9", border: "1.5px solid #BBF7D0" }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{l.student_name}{l.age ? ` · ${l.age} yrs` : ""}</div>
              <div style={{ fontSize: 13, color: "var(--ink2)", margin: "2px 0 12px" }}>
                {programName(l.program_id)} {l.parent_name && <>· {l.parent_name}</>} {l.phone && <>· {l.phone}</>}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button disabled={busyId === l.id} onClick={() => mark(l, true)} style={{
                  flex: 1, padding: "16px 8px", borderRadius: 12, border: "none", cursor: "pointer",
                  background: "linear-gradient(135deg,#22C55E,#16A34A)", color: "white", fontSize: 16, fontWeight: 800,
                }}>✓ Attended</button>
                <button disabled={busyId === l.id} onClick={() => mark(l, false)} style={{
                  flex: 1, padding: "16px 8px", borderRadius: 12, border: "none", cursor: "pointer",
                  background: "linear-gradient(135deg,#EF4444,#DC2626)", color: "white", fontSize: 16, fontWeight: 800,
                }}>✗ No-show</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ LEAD DETAIL ============
function LeadDetail({ lead, onChanged, onBook }: { lead: any; onChanged: () => void; onBook: (l: any) => void }) {
  const app = useApp();
  const router = useRouter();
  const [l, setL] = useState(lead);
  const [activities, setActivities] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [losing, setLosing] = useState(false);
  const [lostReason, setLostReason] = useState(LOST_REASONS[0]);

  async function reload() {
    const [{ data: fresh }, { data: acts }] = await Promise.all([
      supabase.from("leads").select("*").eq("id", lead.id).maybeSingle(),
      supabase.from("lead_activities").select("*").eq("lead_id", lead.id).order("at", { ascending: false }),
    ]);
    if (fresh) setL(fresh);
    setActivities(acts || []);
    onChanged();
  }
  useEffect(() => { reload(); }, []); // eslint-disable-line

  const programName = (id: string) => app.programs.find((p) => p.id === id)?.name || "—";

  async function act(fields: any, action: string, note?: string) {
    setBusy(true);
    await supabase.from("leads").update({ ...fields, last_contact_at: new Date().toISOString() }).eq("id", l.id);
    await supabase.from("lead_activities").insert({ lead_id: l.id, action, note: note || null, by_user: app.userId, by_name: app.userName });
    setBusy(false);
    reload();
  }

  function convert() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lead_prefill", JSON.stringify({
        lead_id: l.id, student_name: l.student_name, parent_name: l.parent_name || "",
        phone: l.phone || "", program_id: l.program_id || "", branch_id: l.branch_id || "",
      }));
    }
    router.push("/invoices?from_lead=1");
  }

  const stage = STAGES.find((s) => s.key === l.status);
  const waLink = l.phone ? `https://wa.me/${l.phone.replace(/[^0-9]/g, "")}` : null;

  return (
    <>
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
          <div>
            <h3 style={{ marginBottom: 4 }}>{l.student_name}{l.age ? <span style={{ fontWeight: 400, fontSize: 14, color: "var(--ink2)" }}> · {l.age} yrs</span> : null}</h3>
            <div style={{ fontSize: 13.5, color: "var(--ink2)" }}>
              {l.parent_name && <>Parent: {l.parent_name} · </>}{l.phone && <>{l.phone} · </>}
              {programName(l.program_id)} · via {l.source}
            </div>
            {l.notes && <div style={{ fontSize: 13, marginTop: 6, padding: 8, background: "#F5F7FB", borderRadius: 8 }}>{l.notes}</div>}
            {l.trial_date && l.status === "TrialBooked" && <div className="banner ok" style={{ marginTop: 8 }}>📅 Trial booked: <b>{l.trial_date}</b></div>}
          </div>
          <span className="pill Draft" style={{ fontSize: 13 }}>{stage?.emoji} {stage?.label}</span>
        </div>

        <div className="btnrow" style={{ marginTop: 14, flexWrap: "wrap" }}>
          {waLink && <a className="btn sm wa" href={waLink} target="_blank" rel="noreferrer">📱 WhatsApp</a>}
          {(l.status === "New" || l.status === "Contacted") && <>
            <button className="btn sm ghost" disabled={busy} onClick={() => act({ status: l.status === "New" ? "Contacted" : l.status }, "Contacted")}>📞 Log contact</button>
            <button className="btn sm" disabled={busy} onClick={() => onBook(l)}>📅 Book trial</button>
          </>}
          {l.status === "TrialBooked" && <>
            <button className="btn sm ok" disabled={busy} onClick={() => act({ status: "TrialAttended", trial_result: "Attended" }, "Trial attended")}>✅ Attended</button>
            <button className="btn sm bad" disabled={busy} onClick={() => act({ status: "Contacted", trial_result: "NoShow", trial_class_id: null, trial_date: null }, "Trial no-show")}>✗ No-show</button>
          </>}
          {l.status === "TrialAttended" && <button className="btn sm ok" disabled={busy} onClick={convert}>🎉 Convert to student</button>}
          {l.status !== "Registered" && l.status !== "Lost" && <button className="btn sm ghost" disabled={busy} onClick={() => setLosing(true)}>❌ Lost</button>}
          {l.status === "Lost" && <button className="btn sm ghost" disabled={busy} onClick={() => act({ status: "Contacted", lost_reason: null }, "Reopened")}>↩️ Reopen</button>}
        </div>

        {losing && (
          <div style={{ marginTop: 12, padding: 12, background: "#FFF5F5", borderRadius: 10, border: "1px solid #FCA5A5" }}>
            <Field label="Why lost?"><Sel value={lostReason} options={LOST_REASONS} onChange={setLostReason} /></Field>
            <div className="btnrow" style={{ marginTop: 8 }}>
              <button className="btn sm bad" disabled={busy} onClick={() => { act({ status: "Lost", lost_reason: lostReason }, "Marked lost", lostReason); setLosing(false); }}>Confirm</button>
              <button className="btn sm ghost" onClick={() => setLosing(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>History</h3>
        {activities.length === 0 ? <div className="empty">No activity yet.</div> : (
          <div style={{ display: "grid", gap: 8 }}>
            {activities.map((a) => (
              <div key={a.id} style={{ padding: 10, background: "#F5F7FB", borderRadius: 10, fontSize: 13 }}>
                <b>{a.action}</b>{a.note && <> — {a.note}</>}
                <div style={{ color: "var(--ink2)", fontSize: 11.5, marginTop: 2 }}>{a.by_name || "Staff"} · {new Date(a.at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ============ ALL LEADS (pipeline) ============
function AllLeads({ rows, programName, isStale, onOpen }: any) {
  const [tab, setTab] = useState("New");
  const [q, setQ] = useState("");
  const counts: Record<string, number> = {};
  STAGES.forEach((s) => { counts[s.key] = rows.filter((r: any) => r.status === s.key).length; });
  const visible = rows.filter((r: any) => r.status === tab && (!q || `${r.student_name} ${r.parent_name || ""} ${r.phone || ""}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <div className="tabs" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        {STAGES.map((s) => (
          <button key={s.key} className={tab === s.key ? "on" : ""} onClick={() => setTab(s.key)}>{s.emoji} {s.label} ({counts[s.key] || 0})</button>
        ))}
      </div>
      <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      {visible.length === 0 ? <div className="panel"><div className="empty">No leads in this stage.</div></div> : (
        <div style={{ display: "grid", gap: 8 }}>
          {visible.map((l: any) => (
            <div key={l.id} onClick={() => onOpen(l)} style={{
              background: "white", border: isStale(l) ? "2px solid #FCA5A5" : "1px solid var(--line)",
              borderRadius: 12, padding: 12, cursor: "pointer",
            }}>
              <b>{l.student_name}</b>{l.age ? <span style={{ color: "var(--ink2)", fontSize: 13 }}> · {l.age} yrs</span> : null}
              {isStale(l) && <span className="pill Rejected" style={{ marginLeft: 8, fontSize: 10 }}>⚠️ {STALE_DAYS}+ days</span>}
              <div style={{ fontSize: 12.5, color: "var(--ink2)", marginTop: 2 }}>
                {l.parent_name || ""} {l.phone ? `· ${l.phone}` : ""} · {programName(l.program_id)} · {l.source}
                {l.trial_date ? ` · 📅 ${l.trial_date}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
