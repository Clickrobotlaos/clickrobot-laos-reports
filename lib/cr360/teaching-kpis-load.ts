import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "./paging";
import { teachingKpis, type KpiAttendance, type KpiLog, type KpiNote, type TeacherKpi } from "./teaching-kpis";
import type { LegacyClass } from "./timetable";

type R<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Month-to-date teaching indicators for the classes in `branches` (null = all, CEO).
 * Reads run as the signed-in user, so RLS decides what is visible. Lesson logs need 0010;
 * without it `logsEnabled` is false and only roll-call indicators are shown.
 */
export async function loadTeachingKpis(sb: SupabaseClient, branches: string[] | null, from: string, until: string) {
  let cq = sb.from("classes").select("id,teacher_id,day_of_week,active,branch_id").eq("active", true);
  if (branches) cq = cq.in("branch_id", branches.length ? branches : ["00000000-0000-0000-0000-000000000000"]);
  const { data: cls, error: cErr } = await cq.limit(1000);
  const classes = (cls ?? []) as Pick<LegacyClass, "id" | "teacher_id" | "day_of_week" | "active" | "branch_id">[];
  const ids = classes.map((c) => c.id);
  if (cErr || ids.length === 0) return { rows: [] as (TeacherKpi & { name: string })[], logsEnabled: true, error: !!cErr };

  const [att, logRes] = await Promise.all([
    fetchAllPages<KpiAttendance & { id: string }>((f, t) => sb.from("attendance").select("id,class_id,date").in("class_id", ids).gte("date", from).lte("date", until).order("id").range(f, t) as unknown as R<KpiAttendance & { id: string }>),
    sb.from("cr360_lesson_logs").select("id,class_id,lesson_date").in("class_id", ids).gte("lesson_date", from).lte("lesson_date", until).limit(5000),
  ]);
  const logs = (logRes.error ? [] : logRes.data ?? []) as KpiLog[];
  const noteRes = logs.length ? await sb.from("cr360_student_lesson_notes").select("lesson_log_id,status").in("lesson_log_id", logs.map((l) => l.id)).limit(20000) : { data: [] };
  const notes = (noteRes.data ?? []) as KpiNote[];

  const teacherIds = [...new Set(classes.map((c) => c.teacher_id).filter((x): x is string => !!x))];
  const { data: emps } = teacherIds.length
    ? await sb.from("cr360_hr_employees").select("auth_user_id,display_name").in("auth_user_id", teacherIds)
    : { data: [] };
  const names = new Map(((emps ?? []) as { auth_user_id: string; display_name: string }[]).map((e) => [e.auth_user_id, e.display_name]));
  const { data: dir } = await sb.rpc("staff_directory");
  for (const d of ((dir ?? []) as { id: string; name: string }[])) if (!names.has(d.id)) names.set(d.id, d.name);

  const rows = teachingKpis(classes, att.rows, logs, notes, from, until)
    .map((k) => ({ ...k, name: names.get(k.teacherId) ?? "—" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { rows, logsEnabled: !logRes.error, error: att.error };
}
