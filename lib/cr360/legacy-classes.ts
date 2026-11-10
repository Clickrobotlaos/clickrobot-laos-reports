import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LegacyBooking, LegacyClass } from "./timetable";
import { fetchAllPages } from "./paging";

const CLASS_COLS = "id,name,program_id,branch_id,teacher_id,assistant_id,day_of_week,start_time,end_time,room,capacity,level,active";

/**
 * Legacy classes + confirmed bookings limited to `branchScope` (null = all; CEO only). As with
 * students, legacy RLS is not branch-aware, so this server filter is the /360 boundary.
 * Teacher overlap is checked across ALL branches (a teacher can't be in two centres), so
 * conflicts are computed on an org-wide teacher/time projection that carries no student data.
 */
export async function loadScopedClasses(sb: SupabaseClient, branchScope: string[] | null) {
  if (branchScope !== null && branchScope.length === 0) return { classes: [] as LegacyClass[], bookings: [] as LegacyBooking[], allForConflicts: [] as LegacyClass[], error: false };
  type R<T> = PromiseLike<{ data: T[] | null; error: unknown }>;
  const [cls, all] = await Promise.all([
    fetchAllPages<LegacyClass>((from, to) => {
      let q = sb.from("classes").select(CLASS_COLS).eq("active", true).order("id");
      if (branchScope !== null) q = q.in("branch_id", branchScope);
      return q.range(from, to) as unknown as R<LegacyClass>;
    }),
    fetchAllPages<LegacyClass>((from, to) => sb.from("classes").select(CLASS_COLS).eq("active", true).order("id").range(from, to) as unknown as R<LegacyClass>),
  ]);
  const classes = cls.rows;
  const ids = classes.map((c) => c.id);
  const bookings: LegacyBooking[] = [];
  let error = cls.error || all.error || cls.truncated || all.truncated;
  for (let i = 0; i < ids.length; i += 100) {
    const r = await fetchAllPages<LegacyBooking>((from, to) => sb.from("class_bookings").select("id,class_id,package_id,kind,makeup_date,status")
      .in("class_id", ids.slice(i, i + 100)).eq("status", "Confirmed").order("id").range(from, to) as unknown as R<LegacyBooking>);
    if (r.error || r.truncated) error = true;
    bookings.push(...r.rows);
  }
  return { classes, bookings, allForConflicts: all.rows, error };
}

/** id → display name for staff. Uses the safe directory RPC (0002) and falls back to the legacy query. */
export async function loadStaffNames(sb: SupabaseClient): Promise<Map<string, string>> {
  const r = await sb.rpc("staff_directory");
  const rows = (r.error ? (await sb.from("users").select("id,name")).data : r.data) ?? [];
  return new Map((rows as { id: string; name: string }[]).map((u) => [u.id, u.name]));
}
