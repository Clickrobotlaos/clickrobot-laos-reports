import Link from "next/link";
import { loadViewer } from "@/lib/cr360/viewer";
import { supabaseServer } from "@/lib/cr360/supabase-server";
import { businessDate, dict } from "@/lib/cr360/i18n";
import { classAccess } from "@/lib/cr360/lesson-access";
import { aiStatus } from "@/lib/cr360/ai-reports";
import { MEDIA_BUCKET, SIGNED_URL_SECONDS } from "@/lib/cr360/media-rules";
import { ClassMedia, type MediaItem } from "@/components/cr360/ClassMedia";
import { loadRollCallData } from "@/lib/cr360/legacy-rollcall";
import { roster } from "@/lib/cr360/rollcall";
import { isValidRubric, type Rubric } from "@/lib/cr360/reports";
import { Unauthorized } from "@/components/cr360/Blocks";
import { LessonWorkspace, type StudentRow } from "@/components/cr360/LessonWorkspace";
import { SubstitutePanel, type SubstituteRow } from "@/components/cr360/SubstitutePanel";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

interface LogRow { id: string; lesson_date: string; unit: string | null; lesson_title: string; level: string | null; covered: string | null; next_plan: string | null; substitute_notes: string | null }
interface NoteRow { id: string; lesson_log_id: string; package_id: string; rubric: unknown; teacher_note: string | null; report_en: string | null; report_lo: string | null; report_source: StudentRow["source"]; status: "draft" | "approved" }

/**
 * Lesson log + student follow-up + parent reports for one class and day.
 * Teacher/assistant, assigned substitute (within dates), branch manager, CEO: read + edit.
 * Everyone else (including other teachers of the branch): no access. The DB (0010) enforces the same.
 */
export default async function LessonPage({ params, searchParams }: { params: Promise<{ classId: string }>; searchParams: Promise<{ date?: string }> }) {
  const ctx = await loadViewer();
  const t = dict(ctx.locale);
  if (!ctx.viewer) return <Unauthorized t={t} />;
  const { classId } = await params;
  if (!UUID.test(classId)) return <Unauthorized t={t} />;
  const today = businessDate();
  const sp = await searchParams;
  const date = sp.date && ISO.test(sp.date) && sp.date <= today ? sp.date : today;

  const sb = await supabaseServer();
  const { cls, canWrite, canRead, isSubstitute, canAssign } = await classAccess(sb, ctx.viewer, classId);
  if (!cls || !canRead) return <Unauthorized t={t} />;

  const [logsRes, rc] = await Promise.all([
    sb.from("cr360_lesson_logs").select("id,lesson_date,unit,lesson_title,level,covered,next_plan,substitute_notes")
      .eq("class_id", cls.id).lte("lesson_date", date).order("lesson_date", { ascending: false }).limit(6),
    loadRollCallData(sb, [cls.id], date),
  ]);
  const enabled = !logsRes.error;
  const logs = (logsRes.data ?? []) as LogRow[];
  const todayLog = logs.find((l) => l.lesson_date === date) ?? null;
  const previous = logs.filter((l) => l.lesson_date < date);
  const latest = todayLog ?? previous[0] ?? null;

  // Substitute assignments (manager / CEO only): current and future, plus branch staff to choose from.
  let subs: SubstituteRow[] = [];
  let subStaff: { userId: string; name: string }[] = [];
  if (canAssign && enabled) {
    const [subRes, empRes] = await Promise.all([
      sb.from("cr360_class_substitutes").select("id,substitute_user,starts_on,ends_on,reason")
        .eq("class_id", cls.id).is("revoked_at", null).gte("ends_on", today).order("starts_on").limit(50),
      sb.from("cr360_hr_employees").select("auth_user_id,display_name,employment_status")
        .eq("branch_id", cls.branch_id).not("auth_user_id", "is", null).order("display_name").limit(200),
    ]);
    const emps = ((empRes.data ?? []) as { auth_user_id: string; display_name: string; employment_status: string }[]);
    const nameOf = new Map(emps.map((e) => [e.auth_user_id, e.display_name]));
    subStaff = emps.filter((e) => e.employment_status === "active" && e.auth_user_id !== cls.teacher_id).map((e) => ({ userId: e.auth_user_id, name: e.display_name }));
    subs = ((subRes.data ?? []) as { id: string; substitute_user: string; starts_on: string; ends_on: string; reason: string }[])
      .map((r) => ({ id: r.id, who: nameOf.get(r.substitute_user) ?? "—", startsOn: r.starts_on, endsOn: r.ends_on, reason: r.reason }));
  }

  // Class media for this day (0016). Missing table → panel hidden. URLs are signed per request, 1 hour.
  const mediaRes = canWrite ? await sb.from("cr360_class_media").select("id,kind,storage_path,caption,status,tagged_packages")
    .eq("class_id", cls.id).eq("lesson_date", date).neq("status", "removed").order("uploaded_at") : { data: null, error: true };
  const mediaRows = (mediaRes.error ? [] : mediaRes.data ?? []) as { id: string; kind: "photo" | "video"; storage_path: string; caption: string | null; status: string; tagged_packages: string[] }[];
  const signed = mediaRows.length ? (await sb.storage.from(MEDIA_BUCKET).createSignedUrls(mediaRows.map((m) => m.storage_path), SIGNED_URL_SECONDS)).data ?? [] : [];
  const urlOf = new Map(signed.map((x) => [x.path, x.signedUrl]));
  const media: MediaItem[] = mediaRows.map((m) => ({ id: m.id, kind: m.kind, url: urlOf.get(m.storage_path) ?? null, caption: m.caption, status: m.status, tagged: m.tagged_packages }));

  const notesRes = enabled && logs.length
    ? await sb.from("cr360_student_lesson_notes").select("id,lesson_log_id,package_id,rubric,teacher_note,report_en,report_lo,report_source,status").in("lesson_log_id", logs.map((l) => l.id))
    : { data: [] };
  const notes = (notesRes.data ?? []) as NoteRow[];
  const logDate = new Map(logs.map((l) => [l.id, l.lesson_date]));
  const entries = roster(cls, rc.bookings, rc.packages, rc.attendance, date);

  const students: StudentRow[] = entries.map((e) => {
    const mine = notes.filter((n) => n.package_id === e.packageId);
    const current = todayLog ? mine.find((n) => n.lesson_log_id === todayLog.id) : undefined;
    const prev = mine.filter((n) => n.lesson_log_id !== todayLog?.id).sort((a, b) => (logDate.get(b.lesson_log_id) ?? "").localeCompare(logDate.get(a.lesson_log_id) ?? ""))[0];
    return {
      packageId: e.packageId, name: e.name, attendance: e.status,
      rubric: current && isValidRubric(current.rubric) ? (current.rubric as Rubric) : {},
      teacherNote: current?.teacher_note ?? "", reportEn: current?.report_en ?? "", reportLo: current?.report_lo ?? "",
      source: current?.report_source ?? "teacher", noteId: current?.id ?? null, status: current?.status ?? null,
      lastFollowUp: prev ? `${logDate.get(prev.lesson_log_id)} — ${prev.teacher_note ?? prev.report_en ?? prev.report_lo ?? ""}`.slice(0, 240) : null,
    };
  });

  const showMedia = canWrite && !mediaRes.error;
  return (
    <>
      <Link href="/360" className="cr-muted">← {t.back}</Link>
      <h1 className="cr-h1" style={{ marginTop: 8 }}>{cls.name}</h1>
      <p className="cr-sub">{t.lessonsTitle}</p>
      {!enabled && <div className="cr-banner info">{t.lessonsNotEnabled}</div>}
      {isSubstitute && <div className="cr-banner info">{t.subYouAre}</div>}
      {canAssign && enabled && <SubstitutePanel classId={cls.id} staff={subStaff} current={subs} t={t} />}

      <section className="cr-card" aria-labelledby="wc-h" style={{ marginBottom: 14 }}>
        <h2 id="wc-h">{t.whereClassIs}</h2>
        {!latest ? <p className="cr-muted">{t.noLessonsYet}</p> : (
          <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 14px", margin: 0 }}>
            <dt className="cr-muted">{t.lastLesson}</dt><dd style={{ margin: 0 }}><b>{latest.lesson_date}</b> · {[latest.unit, latest.lesson_title].filter(Boolean).join(" — ")}</dd>
            {latest.level && <><dt className="cr-muted">{t.levelLbl}</dt><dd style={{ margin: 0 }}>{latest.level}</dd></>}
            {latest.covered && <><dt className="cr-muted">{t.coveredLbl}</dt><dd style={{ margin: 0 }}>{latest.covered}</dd></>}
            {latest.next_plan && <><dt className="cr-muted">{t.nextPlanLbl}</dt><dd style={{ margin: 0 }}><b>{latest.next_plan}</b></dd></>}
            {latest.substitute_notes && <><dt className="cr-muted">{t.subNotesLbl}</dt><dd style={{ margin: 0 }}>{latest.substitute_notes}</dd></>}
          </dl>
        )}
        {previous.length > 1 && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer" }}>{t.earlierLessons}</summary>
            <ul className="cr-list">{previous.map((l) => <li key={l.id}><span>{l.lesson_date}</span><span>{[l.unit, l.lesson_title].filter(Boolean).join(" — ")}</span></li>)}</ul>
          </details>
        )}
      </section>

      {canWrite && enabled ? (
        <LessonWorkspace
          classId={cls.id} date={date} logId={todayLog?.id ?? null} t={t} students={students} aiReady={aiStatus().ready}
          lesson={{
            // Last lesson's "plan for next class" is usually today's lesson: pre-fill it for the teacher to confirm.
            unit: todayLog?.unit ?? previous[0]?.unit ?? "", lessonTitle: todayLog?.lesson_title ?? (previous[0]?.next_plan ?? "").slice(0, 200),
            level: todayLog?.level ?? previous[0]?.level ?? "", covered: todayLog?.covered ?? "",
            nextPlan: todayLog?.next_plan ?? "", substituteNotes: todayLog?.substitute_notes ?? "",
          }}
        />
      ) : !canWrite ? (
        <div className="cr-banner info">{t.readOnlySubstitute}</div>
      ) : null}
      {showMedia && (
        <div style={{ marginTop: 14 }}>
          <ClassMedia classId={cls.id} branchId={cls.branch_id} date={date} t={t} items={media}
            students={entries.map((e) => ({ packageId: e.packageId, name: e.name }))} />
        </div>
      )}
    </>
  );
}
