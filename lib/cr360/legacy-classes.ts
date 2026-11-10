import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LegacyBooking, LegacyClass } from "./timetable";

const CLASS_COLS = "id,name,program_id,branch_id,teacher_id,assistant_id,day_of_week,start_time,end_time,room,capacity,level,active";

/**
 * Legacy classes + confirmed bookings limited to `branchScope` (null = all; CEO only). As with
 * students, legacy RLS is not branch-aware, so this server filter is the /360 boundary.
 * Teacher overlap is checked across ALL branches (a teacher can't be in two centres), so
 * conflicts are computed on an org-wide teacher/time projection that carries no student data.
 */
export async function loadScopedClasses(sb: SupabaseClient, branchScope: string[] | null) {
  if (branchScope !== null && branchScope.length === 0) return { classes: [] as LegacyClass[], bookings: [] as LegacyBooking[], allForConflicts: [] as LegacyClass[], error: false };
  let q = sb.from("classes").select(CLASS_COLS).eq("active", true).limit(2000);
  if (branchScope !== null) q = q.in("branch_id", branchScope);
  const [cls, all] = await Promise.all([
    q,
    sb.from("classes").select("id,name,branch_id,teacher_id,assistant_id,day_of_week,start_time,end_time,room,active,capacity,level,program_id").eq("active", true).limit(5000),
  ]);
  const classes = (cls.data ?? []) as LegacyClass[];
  const ids = classes.map((c) => c.id);
  const bookings: LegacyBooking[] = [];
  let error = !!cls.error || !!all.error;
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error: e } = await sb.from("class_bookings").select("id,class_id,package_id,kind,makeup_date,status")
      .in("class_id", ids.slice(i, i + 100)).eq("status", "Confirmed").limit(10000);
    if (e) error = true;
    bookings.push(...((data ?? []) as LegacyBooking[]));
  }
  return { classes, bookings, allForConflicts: (all.data ?? []) as LegacyClass[], error };
}

/** id → display name for staff. Uses the safe directory RPC (0002) and falls back to the legacy query. */
export async function loadStaffNames(sb: SupabaseClient): Promise<Map<string, string>> {
  const r = await sb.rpc("staff_directory");
  const rows = (r.error ? (await sb.from("users").select("id,name")).data : r.data) ?? [];
  return new Map((rows as { id: string; name: string }[]).map((u) => [u.id, u.name]));
}
