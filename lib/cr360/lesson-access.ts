import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasRole, studentBranchScope } from "./access";
import { canTakeAttendance } from "./rollcall";
import type { LegacyClass } from "./timetable";
import type { Viewer } from "./types";

const CLASS_COLS = "id,name,program_id,branch_id,teacher_id,assistant_id,day_of_week,start_time,end_time,room,capacity,level,active";

/** Class + whether the viewer may write (teacher/assistant/manager/CEO) or only read (same-branch substitute). */
export async function classAccess(sb: SupabaseClient, viewer: Viewer, classId: string) {
  const { data } = await sb.from("classes").select(CLASS_COLS).eq("id", classId).eq("active", true).maybeSingle();
  if (!data) return { cls: null, canWrite: false, canRead: false };
  const cls = data as LegacyClass;
  const scope = studentBranchScope(viewer);
  const canWrite = canTakeAttendance(cls, viewer.userId, { isCeo: hasRole(viewer, ["ceo"]), managerOf: scope ?? [] });
  const sameBranch = viewer.grants.some((g) => g.active && g.branchId === cls.branch_id);
  return { cls, canWrite, canRead: canWrite || sameBranch || hasRole(viewer, ["hr"]) };
}
