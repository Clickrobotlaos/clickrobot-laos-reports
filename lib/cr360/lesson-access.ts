import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasRole, studentBranchScope } from "./access";
import { businessDate } from "./i18n";
import { canTakeAttendance } from "./rollcall";
import type { LegacyClass } from "./timetable";
import type { Viewer } from "./types";

const CLASS_COLS = "id,name,program_id,branch_id,teacher_id,assistant_id,day_of_week,start_time,end_time,room,capacity,level,active";

/**
 * Is the viewer a manager-assigned substitute for this class today (0010 cr360_class_substitutes)?
 * Before 0010 the table does not exist: the query errors and the answer is "no" (fail closed).
 */
export async function isActiveSubstitute(sb: SupabaseClient, userId: string, classId: string, today = businessDate()): Promise<boolean> {
  const { data, error } = await sb.from("cr360_class_substitutes").select("id")
    .eq("class_id", classId).eq("substitute_user", userId).is("revoked_at", null)
    .lte("starts_on", today).gte("ends_on", today).limit(1);
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Class + access. Owner rule (2026-11-11): private teaching records are need-to-know — the class
 * teacher/assistant, a manager-ASSIGNED substitute (within the assignment dates), that branch's
 * manager and the CEO. Other teachers of the branch and HR-by-role get nothing. Mirrors 0010.
 */
export async function classAccess(sb: SupabaseClient, viewer: Viewer, classId: string) {
  const { data } = await sb.from("classes").select(CLASS_COLS).eq("id", classId).eq("active", true).maybeSingle();
  if (!data) return { cls: null, canWrite: false, canRead: false, isSubstitute: false, canAssign: false };
  const cls = data as LegacyClass;
  const isCeo = hasRole(viewer, ["ceo"]);
  const managerOf = studentBranchScope(viewer) ?? []; // manager branches (CEO: null -> handled by isCeo)
  const regular = canTakeAttendance(cls, viewer.userId, { isCeo, managerOf });
  const isSubstitute = !regular && (await isActiveSubstitute(sb, viewer.userId, cls.id));
  const canWrite = regular || isSubstitute;
  return { cls, canWrite, canRead: canWrite, isSubstitute, canAssign: isCeo || managerOf.includes(cls.branch_id) };
}
