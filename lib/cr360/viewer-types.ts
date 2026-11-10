/** Row shape returned by public.cr360_guardian_children() (proposed migration 0005). */
export interface GuardianChildRow {
  student_code: string; student_name: string; package_id: string; program_name: string | null; branch_name: string | null;
  package: string | null; sessions_total: number | null; sessions_used: number | null; active: boolean | null; start_date: string | null;
}
