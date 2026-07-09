"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field, Sel } from "@/components/ui";
import { CURRENCIES, PERMS, csvDownload } from "@/lib/util";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function ClassesPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  const can = PERMS[app.role];
  if (!(app.role === "admin" || app.role === "manager")) {
    return <Shell><div className="panel"><div className="empty">Only CEO/Manager can manage classes.</div></div></Shell>;
  }
  return <Shell><ClassesView /></Shell>;
}

function ClassesView() {
  const app = useApp();
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState<null | any>(null);
  const [q, setQ] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [dayFilter, setDayFilter] = useState<string>("");
  const [fields, setFields] = useState<any>({ capacity: true, age: true, level: true, fee: true, room: true });

  async function reload() {
    setLoading(true);
    const [c, s, cfg] = await Promise.all([
      supabase.from("classes").select("*").order("day_of_week").order("start_time"),
      supabase.from("users").select("id,name,position,role").eq("status", "Active").order("name"),
      supabase.from("settings").select("value").eq("key", "class_fields").maybeSingle(),
    ]);
    setRows(c.data || []); setStaff(s.data || []);
    if (cfg.data?.value) setFields({ ...fields, ...cfg.data.value });
    setLoading(false);
  }
  useEffect(() => { reload(); }, []); // eslint-disable-line

  const branchName = (id: string) => app.branches.find((b) => b.id === id)?.name || "";
  const programName = (id: string) => app.programs.find((p) => p.id === id)?.name || "";
  const staffName = (id: string) => staff.find((s) => s.id === id)?.name || "—";

  const visible = rows.filter((r) => {
    if (branchFilter && r.branch_id !== branchFilter) return false;
    if (dayFilter !== "" && String(r.day_of_week) !== dayFilter) return false;
    if (!q) return true;
    return `${r.name} ${r.room || ""} ${r.level || ""}`.toLowerCase().includes(q.toLowerCase());
  });

  async function del(id: string) {
    if (!confirm("Delete this class? All student enrollments in it will be removed.")) return;
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) { alert("Delete failed: " + error.message); return; }
    reload();
  }

  return (
    <div>
      <div className="sectionhead">
        <h2>Classes</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm ghost" onClick={() => csvDownload("classes.csv", visible)} disabled={!visible.length}>Export CSV</button>
          <button className="btn sm" onClick={() => setShowForm({})}>+ New class</button>
        </div>
      </div>

      {showForm !== null && (
        <ClassForm existing={Object.keys(showForm).length ? showForm : undefined}
          staff={staff} fields={fields}
          onDone={() => { setShowForm(null); reload(); }}
          onCancel={() => setShowForm(null)} />
      )}

      {showForm === null && (
        <>
          <div className="frow c3" style={{ marginBottom: 12 }}>
            <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">All branches</option>
              {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}>
              <option value="">All days</option>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>

          {loading ? <div className="panel"><div className="empty">Loading…</div></div>
            : visible.length === 0 ? <div className="panel"><div className="empty">No classes yet. Click &quot;+ New class&quot; to create your first weekly slot.</div></div>
              : (
                <div className="tblwrap">
                  <table className="tbl">
                    <thead><tr>
                      <th>Class</th><th>Day/Time</th><th>Branch</th>
                      <th>Program</th><th>Teacher</th>
                      {fields.capacity && <th style={{ textAlign: "right" }}>Capacity</th>}
                      {fields.fee && <th style={{ textAlign: "right" }}>Fee</th>}
                      <th></th>
                    </tr></thead>
                    <tbody>{visible.map((r) => (
                      <tr key={r.id}>
                        <td><b>{r.name}</b>{r.level && <div style={{ fontSize: 12, color: "var(--ink2)" }}>{r.level}</div>}</td>
                        <td>{r.day_of_week !== null ? DAYS[r.day_of_week].slice(0,3) : "—"} {(r.start_time || "").slice(0,5)}–{(r.end_time || "").slice(0,5)}</td>
                        <td>{branchName(r.branch_id)}</td>
                        <td>{programName(r.program_id) || "—"}</td>
                        <td>{staffName(r.teacher_id)}</td>
                        {fields.capacity && <td className="num">{r.capacity || "—"}</td>}
                        {fields.fee && <td className="num">{r.class_fee ? `${r.class_fee} ${r.fee_currency}` : "—"}</td>}
                        <td style={{ display: "flex", gap: 6 }}>
                          <button className="btn sm ghost" onClick={() => router.push(`/classes/${r.id}`)}>Open</button>
                          <button className="btn sm ghost" onClick={() => setShowForm(r)}>Edit</button>
                          <button className="btn sm bad" onClick={() => del(r.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
        </>
      )}
    </div>
  );
}

function ClassForm({ existing, staff, fields, onDone, onCancel }: {
  existing?: any; staff: any[]; fields: any;
  onDone: () => void; onCancel: () => void;
}) {
  const app = useApp();
  const [f, setF] = useState<any>(existing || {
    name: "", program_id: app.programs[0]?.id || "", branch_id: app.branches[0]?.id || "",
    teacher_id: "", assistant_id: "",
    day_of_week: 6, start_time: "10:00", end_time: "11:30",
    room: "", capacity: 10, age_min: 6, age_max: 12,
    level: "Beginner", class_fee: "", fee_currency: "LAK",
    active: true, notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true); setErr("");
    const payload = {
      name: f.name, program_id: f.program_id || null, branch_id: f.branch_id,
      teacher_id: f.teacher_id || null, assistant_id: f.assistant_id || null,
      day_of_week: f.day_of_week === "" ? null : Number(f.day_of_week),
      start_time: f.start_time || null, end_time: f.end_time || null,
      room: f.room || null, capacity: Number(f.capacity) || null,
      age_min: Number(f.age_min) || null, age_max: Number(f.age_max) || null,
      level: f.level || null,
      class_fee: Number(f.class_fee) || null, fee_currency: f.fee_currency || "LAK",
      active: !!f.active, notes: f.notes || null,
    };
    const result = existing?.id
      ? await supabase.from("classes").update(payload).eq("id", existing.id)
      : await supabase.from("classes").insert(payload);
    setBusy(false);
    if (result.error) { setErr(result.error.message); return; }
    onDone();
  }

  return (
    <div className="panel">
      <h3>{existing ? "Edit class" : "New class"}</h3>
      <div className="frow c3">
        <Field label="Class name *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. LEGO Essential — Sat 10am Beginner" /></Field>
        <Field label="Program">
          <select value={f.program_id || ""} onChange={(e) => setF({ ...f, program_id: e.target.value })}>
            <option value="">—</option>
            {app.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Branch *">
          <select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
            {app.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Teacher">
          <select value={f.teacher_id || ""} onChange={(e) => setF({ ...f, teacher_id: e.target.value })}>
            <option value="">—</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.position ? ` · ${s.position}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Assistant (optional)">
          <select value={f.assistant_id || ""} onChange={(e) => setF({ ...f, assistant_id: e.target.value })}>
            <option value="">—</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Day of week">
          <select value={f.day_of_week} onChange={(e) => setF({ ...f, day_of_week: e.target.value })}>
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </Field>
        <Field label="Start time"><input type="time" value={f.start_time || ""} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></Field>
        <Field label="End time"><input type="time" value={f.end_time || ""} onChange={(e) => setF({ ...f, end_time: e.target.value })} /></Field>
        {fields.room && <Field label="Room"><input value={f.room || ""} onChange={(e) => setF({ ...f, room: e.target.value })} placeholder="e.g. Room 2" /></Field>}
        {fields.capacity && <Field label="Max capacity"><input type="number" inputMode="numeric" min="1" value={f.capacity || ""} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>}
        {fields.age && <>
          <Field label="Min age"><input type="number" inputMode="numeric" min="0" value={f.age_min || ""} onChange={(e) => setF({ ...f, age_min: e.target.value })} /></Field>
          <Field label="Max age"><input type="number" inputMode="numeric" min="0" value={f.age_max || ""} onChange={(e) => setF({ ...f, age_max: e.target.value })} /></Field>
        </>}
        {fields.level && <Field label="Level">
          <Sel value={f.level || "Beginner"} options={["Beginner","Intermediate","Advanced"]} onChange={(v) => setF({ ...f, level: v })} />
        </Field>}
        {fields.fee && <>
          <Field label="Default class fee"><input type="number" inputMode="decimal" value={f.class_fee || ""} onChange={(e) => setF({ ...f, class_fee: e.target.value })} placeholder="0" /></Field>
          <Field label="Fee currency"><Sel value={f.fee_currency || "LAK"} options={[...CURRENCIES]} onChange={(v) => setF({ ...f, fee_currency: v })} /></Field>
        </>}
        <Field label="Active">
          <Sel value={f.active ? "Yes" : "No"} options={["Yes", "No"]} onChange={(v) => setF({ ...f, active: v === "Yes" })} />
        </Field>
      </div>
      <Field label="Notes"><textarea rows={2} value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {err && <div className="banner bad">{err}</div>}
      <div className="btnrow">
        <button className="btn" disabled={busy || !f.name || !f.branch_id} onClick={save}>{busy ? "Saving…" : existing ? "Save changes" : "Create class"}</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
