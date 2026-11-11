"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dict, DictKey } from "@/lib/cr360/i18n";
import { RUBRIC_SKILLS, type Rubric, type RubricSkill } from "@/lib/cr360/reports";

export interface LessonFields { unit: string; lessonTitle: string; level: string; covered: string; nextPlan: string; substituteNotes: string }
export interface StudentRow {
  packageId: string; name: string; attendance: "Present" | "Absent" | null;
  rubric: Rubric; teacherNote: string; reportEn: string; reportLo: string;
  source: "teacher" | "ai_draft" | "ai_draft_edited" | "template"; noteId: string | null; status: "draft" | "approved" | null;
  lastFollowUp: string | null;
}

/** Teacher workspace: lesson log + per-student follow-up + AI/template drafted parent reports. */
export function LessonWorkspace({ classId, date, logId: initialLogId, lesson: initialLesson, students: initialStudents, t }: {
  classId: string; date: string; logId: string | null; lesson: LessonFields; students: StudentRow[]; t: Dict;
}) {
  const router = useRouter();
  const [logId, setLogId] = useState(initialLogId);
  const [lesson, setLesson] = useState(initialLesson);
  const [rows, setRows] = useState(initialStudents);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const errText = (code?: string) => (t as Record<string, string>)[`err_${code ?? "server_error"}`] ?? t.err_server_error;
  const patch = (pkg: string, p: Partial<StudentRow>) => setRows((rs) => rs.map((r) => (r.packageId === pkg ? { ...r, ...p } : r)));
  // Any edit to what parents read marks AI text as edited and an approved report as draft (DB enforces the same).
  const editReport = (r: StudentRow, p: Partial<StudentRow>) => patch(r.packageId, {
    ...p, source: r.source === "ai_draft" ? "ai_draft_edited" : r.source, status: r.status === "approved" ? "draft" : r.status,
  });

  async function post(path: string, body: unknown) {
    const res = await fetch(`/api/cr360/lessons/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, j };
  }
  const opt = (s: string) => (s.trim() ? s.trim() : undefined);

  async function saveLog() {
    setBusy("log"); setMsg(null);
    const { ok, j } = await post("save", {
      classId, date, unit: opt(lesson.unit), lessonTitle: lesson.lessonTitle.trim(), level: opt(lesson.level),
      covered: opt(lesson.covered), nextPlan: opt(lesson.nextPlan), substituteNotes: opt(lesson.substituteNotes),
    });
    setBusy(null);
    if (!ok) { setMsg({ tone: "warn", text: errText(j.reasonCode) }); return; }
    setLogId(j.logId); setMsg({ tone: "ok", text: t.saved }); router.refresh();
  }

  async function draft(mode: "ai" | "template") {
    setBusy(mode); setMsg(null);
    const { ok, j } = await post("draft", {
      classId, date, mode,
      lesson: { unit: opt(lesson.unit), lessonTitle: lesson.lessonTitle.trim() || "Lesson", level: opt(lesson.level), covered: opt(lesson.covered), nextPlan: opt(lesson.nextPlan) },
      students: rows.map((r) => ({ packageId: r.packageId, rubric: r.rubric, teacherNote: opt(r.teacherNote) })),
    });
    setBusy(null);
    if (!ok) { setMsg({ tone: "warn", text: errText(j.reasonCode) }); return; }
    const drafts = (j.drafts ?? {}) as Record<string, { en: string; lo: string }>;
    setRows((rs) => rs.map((r) => (drafts[r.packageId]
      ? { ...r, reportEn: drafts[r.packageId].en, reportLo: drafts[r.packageId].lo, source: j.source, status: r.status === "approved" ? "draft" : r.status }
      : r)));
  }

  async function saveNote(r: StudentRow): Promise<string | null> {
    if (!logId) { setMsg({ tone: "warn", text: t.saveLogFirst }); return null; }
    setBusy(r.packageId); setMsg(null);
    const { ok, j } = await post("note", {
      logId, packageId: r.packageId, rubric: r.rubric, teacherNote: opt(r.teacherNote),
      reportEn: opt(r.reportEn), reportLo: opt(r.reportLo), source: r.source,
    });
    setBusy(null);
    if (!ok) { setMsg({ tone: "warn", text: errText(j.reasonCode) }); return null; }
    patch(r.packageId, { noteId: j.noteId, status: r.status === "approved" ? "approved" : "draft" });
    return j.noteId as string;
  }

  async function approve(r: StudentRow) {
    const noteId = await saveNote(r);
    if (!noteId) return;
    setBusy(r.packageId);
    const { ok, j } = await post("approve", { noteId });
    setBusy(null);
    if (!ok) { setMsg({ tone: "warn", text: errText(j.reasonCode) }); return; }
    patch(r.packageId, { status: "approved" }); router.refresh();
  }

  async function copy(r: StudentRow) {
    const text = [r.reportLo, r.reportEn].filter((x) => x.trim()).join("\n\n");
    try { await navigator.clipboard.writeText(text); setMsg({ tone: "ok", text: t.copied }); } catch { setMsg({ tone: "warn", text: t.err_server_error }); }
  }

  const field = (key: keyof LessonFields, label: string, multi = false) => (
    <div className="cr-field">
      <label htmlFor={`lf-${key}`}>{label}</label>
      {multi
        ? <textarea id={`lf-${key}`} rows={2} maxLength={4000} value={lesson[key]} onChange={(e) => setLesson({ ...lesson, [key]: e.target.value })} />
        : <input id={`lf-${key}`} maxLength={200} value={lesson[key]} onChange={(e) => setLesson({ ...lesson, [key]: e.target.value })} />}
    </div>
  );

  return (
    <div className="cr-grid" style={{ gap: 14 }}>
      <section className="cr-card" aria-labelledby="ll-h">
        <h2 id="ll-h">{t.lessonsTitle} · {date}</h2>
        <div className="cr-form">
          <div className="cr-row">{field("unit", t.unitLbl)}{field("level", t.levelLbl)}</div>
          {field("lessonTitle", t.lessonTitleLbl)}
          {field("covered", t.coveredLbl, true)}
          {field("nextPlan", t.nextPlanLbl, true)}
          {field("substituteNotes", t.subNotesLbl, true)}
          <button type="button" className="cr-btn" disabled={busy !== null || lesson.lessonTitle.trim().length < 2} onClick={saveLog}>
            {busy === "log" ? t.submitting : t.saveLessonLog}
          </button>
        </div>
      </section>

      <section className="cr-card" aria-labelledby="sf-h">
        <h2 id="sf-h">{t.studentsFollowUp}</h2>
        <p className="cr-muted">{t.aiNote}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button type="button" className="cr-btn teal" disabled={busy !== null || rows.length === 0} onClick={() => draft("ai")}>{busy === "ai" ? t.aiDrafting : t.draftAllAI}</button>
          <button type="button" className="cr-btn ghost" disabled={busy !== null || rows.length === 0} onClick={() => draft("template")}>{t.useTemplate}</button>
        </div>
        <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
        {rows.length === 0 ? <p className="cr-muted">{t.noStudentsBooked}</p> : rows.map((r) => (
          <article key={r.packageId} className="cr-slot" style={{ padding: 14, marginBottom: 12 }} aria-label={r.name}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <b style={{ fontSize: 15 }}>{r.name}</b>
              <span>
                {r.attendance && <span className={`cr-badge ${r.attendance === "Present" ? "approved" : "rejected"}`}>{r.attendance === "Present" ? t.present : t.absent}</span>}{" "}
                {r.status && <span className={`cr-badge ${r.status === "approved" ? "approved" : "pending"}`}>{r.status === "approved" ? t.approved : t.draft}</span>}
              </span>
            </div>
            {r.lastFollowUp && <p className="cr-muted" style={{ margin: "6px 0" }}>{t.lastFollowUp}: {r.lastFollowUp}</p>}
            <div className="cr-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", margin: "8px 0" }}>
              {RUBRIC_SKILLS.map((k: RubricSkill) => (
                <div key={k} className="cr-field">
                  <label htmlFor={`rb-${r.packageId}-${k}`}>{t[`skill_${k}` as DictKey]}</label>
                  <select id={`rb-${r.packageId}-${k}`} value={r.rubric[k] ?? ""} onChange={(e) => {
                    const v = e.target.value; const next = { ...r.rubric };
                    if (v) next[k] = Number(v) as 1 | 2 | 3 | 4; else delete next[k];
                    editReport(r, { rubric: next });
                  }}>
                    <option value="">{t.notScored}</option>
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{t[`score${n}` as DictKey]}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="cr-field"><label htmlFor={`tn-${r.packageId}`}>{t.privateNote}</label>
              <textarea id={`tn-${r.packageId}`} rows={2} maxLength={2000} value={r.teacherNote} onChange={(e) => patch(r.packageId, { teacherNote: e.target.value })} /></div>
            <div className="cr-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginTop: 8 }}>
              <div className="cr-field"><label htmlFor={`rl-${r.packageId}`}>{t.reportLo}</label>
                <textarea id={`rl-${r.packageId}`} lang="lo" rows={4} maxLength={3000} value={r.reportLo} onChange={(e) => editReport(r, { reportLo: e.target.value })} /></div>
              <div className="cr-field"><label htmlFor={`re-${r.packageId}`}>{t.reportEn}</label>
                <textarea id={`re-${r.packageId}`} lang="en" rows={4} maxLength={3000} value={r.reportEn} onChange={(e) => editReport(r, { reportEn: e.target.value })} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button type="button" className="cr-btn ghost" disabled={busy !== null} onClick={() => saveNote(r)}>{busy === r.packageId ? t.submitting : t.saveDraft}</button>
              <button type="button" className="cr-btn teal" disabled={busy !== null || r.status === "approved" || !(r.reportEn.trim() || r.reportLo.trim())} onClick={() => approve(r)}>{t.approveReport}</button>
              <button type="button" className="cr-btn ghost" disabled={!(r.reportEn.trim() || r.reportLo.trim())} onClick={() => copy(r)}>{t.copyReport}</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
