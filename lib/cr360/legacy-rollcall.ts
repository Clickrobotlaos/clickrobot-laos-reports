import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LegacyBooking } from "./timetable";
import type { RosterPackage, TodayAttendance } from "./rollcall";

/** Bookings, packages (name + balance only) and today's attendance for the given classes. */
export async function loadRollCallData(sb: SupabaseClient, classIds: string[], date: string) {
  if (classIds.length === 0) return { bookings: [] as LegacyBooking[], packages: [] as RosterPackage[], attendance: [] as TodayAttendance[], error: false };
  const { data: b, error: e1 } = await sb.from("class_bookings").select("id,class_id,package_id,kind,makeup_date,status")
    .in("class_id", classIds).eq("status", "Confirmed").limit(1000);
  const bookings = (b ?? []) as LegacyBooking[];
  const pkgIds = [...new Set(bookings.map((x) => x.package_id))];
  if (pkgIds.length === 0) return { bookings, packages: [], attendance: [], error: !!e1 };
  const [p, a] = await Promise.all([
    sb.from("student_packages").select("id,student_name,sessions_total,sessions_used,active").in("id", pkgIds).limit(1000),
    sb.from("attendance").select("id,package_id,class_id,status,date").in("package_id", pkgIds).eq("date", date).limit(1000),
  ]);
  return { bookings, packages: (p.data ?? []) as RosterPackage[], attendance: (a.data ?? []) as TodayAttendance[], error: !!(e1 || p.error || a.error) };
}
