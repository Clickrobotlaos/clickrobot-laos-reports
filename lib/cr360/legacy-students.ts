import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LegacyAttendance, LegacyPackage } from "./students";

const PKG_COLS = "id,student_id,student_name,branch_id,program_id,package,sessions_total,sessions_used,base_sessions,bonus_sessions,start_date,active,student_status,created_at";

/**
 * Reads legacy student packages limited to `branchScope` (null = all branches, CEO only).
 * IMPORTANT: legacy RLS on student_packages/attendance lets any signed-in user read every row,
 * so this server-side filter IS the effective branch boundary for /360 until branch-scoped
 * policies replace the legacy ones (planned migration 0006). Pages must call this, never query directly.
 * Selects no contact, photo, DOB or token columns.
 */
export async function loadScopedPackages(
  sb: SupabaseClient,
  branchScope: string[] | null,
  where?: { studentCode?: string; packageId?: string },
): Promise<{ packages: LegacyPackage[]; error: boolean }> {
  if (branchScope !== null && branchScope.length === 0) return { packages: [], error: false };
  let q = sb.from("student_packages").select(PKG_COLS).order("student_name").limit(5000);
  if (branchScope !== null) q = q.in("branch_id", branchScope);
  if (where?.studentCode) q = q.eq("student_id", where.studentCode);
  if (where?.packageId) q = q.eq("id", where.packageId);
  const { data, error } = await q;
  return { packages: (data ?? []) as LegacyPackage[], error: !!error };
}

/** Attendance for the given packages only, fetched in chunks to keep request URLs short. */
export async function loadAttendanceFor(sb: SupabaseClient, packageIds: string[]): Promise<{ rows: LegacyAttendance[]; error: boolean }> {
  const rows: LegacyAttendance[] = [];
  let error = false;
  for (let i = 0; i < packageIds.length; i += 100) {
    const chunk = packageIds.slice(i, i + 100);
    const { data, error: e } = await sb.from("attendance")
      .select("id,package_id,date,status,is_makeup,class_id,created_at")
      .in("package_id", chunk).order("date").limit(10000);
    if (e) error = true;
    rows.push(...((data ?? []) as LegacyAttendance[]));
  }
  return { rows, error };
}

export async function loadNames(sb: SupabaseClient) {
  const [b, p] = await Promise.all([
    sb.from("branches").select("id,name"),
    sb.from("programs").select("id,name"),
  ]);
  return {
    branch: new Map((b.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name])),
    program: new Map((p.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name])),
  };
}
