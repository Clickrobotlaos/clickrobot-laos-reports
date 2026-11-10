import "server-only";
import { cookies } from "next/headers";
import { supabaseServer } from "./supabase-server";
import type { AppRole, Viewer } from "./types";
import { LOCALE_COOKIE, parseLocale, type Locale } from "./i18n";
import type { GuardianChildRow } from "./viewer-types";
export type { GuardianChildRow };

export interface ViewerContext {
  viewer: Viewer | null;
  /** Signed in, but no cr360 membership row. */
  signedInWithoutMembership: boolean;
  displayName: string | null;
  employee: { id: string; branch_id: string; display_name: string; position: string; employment_status: string } | null;
  locale: Locale;
  /** Verified guardian rows from cr360_guardian_children() (proposed migration 0005); [] otherwise. */
  guardianChildren: GuardianChildRow[];
}

/**
 * Builds the authorization context from DATABASE ROWS ONLY:
 *  - auth.getUser() (verified with the Auth server, not just a decoded cookie)
 *  - public.cr360_hr_memberships (RLS: own row)
 *  - public.cr360_hr_employees  (RLS: own row)
 *  - public.cr360_guardian_children() for non-staff (verified guardian links only; migration 0005)
 * user_metadata / app UI selections are never consulted.
 */
export async function loadViewer(): Promise<ViewerContext> {
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  const user = auth.user;
  if (!user) return { viewer: null, signedInWithoutMembership: false, displayName: null, employee: null, locale, guardianChildren: [] };

  const [{ data: mem }, { data: emp }] = await Promise.all([
    sb.from("cr360_hr_memberships").select("role,branch_id,active").eq("user_id", user.id).maybeSingle(),
    sb.from("cr360_hr_employees").select("id,branch_id,display_name,position,employment_status").eq("auth_user_id", user.id).maybeSingle(),
  ]);

  if (!mem || !mem.active) {
    // Not staff: a verified guardian? The DB function only returns children whose link is verified,
    // consented and not revoked. If 0005 is not deployed the call errors and we fall through unchanged.
    const { data: kids, error } = await sb.rpc("cr360_guardian_children");
    const rows = (!error && Array.isArray(kids) ? kids : []) as GuardianChildRow[];
    if (rows.length > 0) {
      return {
        viewer: {
          userId: user.id,
          grants: [{ role: "guardian", branchId: null, active: true }],
          employeeId: null,
          guardianOf: [...new Set(rows.map((r) => r.student_code))],
          partnerGrants: [],
        },
        signedInWithoutMembership: false, displayName: null, employee: null, locale, guardianChildren: rows,
      };
    }
    return { viewer: null, signedInWithoutMembership: true, displayName: emp?.display_name ?? null, employee: null, locale, guardianChildren: [] };
  }

  const employee = emp && emp.employment_status === "active" ? emp : null;
  const viewer: Viewer = {
    userId: user.id,
    grants: [{ role: mem.role as AppRole, branchId: mem.branch_id, active: mem.active }],
    employeeId: employee?.id ?? null,
    guardianOf: [], // staff members are not treated as guardians here (separate account recommended)
    partnerGrants: [], // partner grants: future migration (not yet drafted)
  };
  return { viewer, signedInWithoutMembership: false, displayName: employee?.display_name ?? null, employee, locale, guardianChildren: [] };
}
