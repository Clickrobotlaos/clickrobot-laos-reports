import "server-only";
import { cookies } from "next/headers";
import { supabaseServer } from "./supabase-server";
import type { AppRole, Viewer } from "./types";
import { LOCALE_COOKIE, parseLocale, type Locale } from "./i18n";

export interface ViewerContext {
  viewer: Viewer | null;
  /** Signed in, but no cr360 membership row. */
  signedInWithoutMembership: boolean;
  displayName: string | null;
  employee: { id: string; branch_id: string; display_name: string; position: string; employment_status: string } | null;
  locale: Locale;
}

/**
 * Builds the authorization context from DATABASE ROWS ONLY:
 *  - auth.getUser() (verified with the Auth server, not just a decoded cookie)
 *  - public.cr360_hr_memberships (RLS: own row)
 *  - public.cr360_hr_employees  (RLS: own row)
 * user_metadata / app UI selections are never consulted.
 */
export async function loadViewer(): Promise<ViewerContext> {
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  const user = auth.user;
  if (!user) return { viewer: null, signedInWithoutMembership: false, displayName: null, employee: null, locale };

  const [{ data: mem }, { data: emp }] = await Promise.all([
    sb.from("cr360_hr_memberships").select("role,branch_id,active").eq("user_id", user.id).maybeSingle(),
    sb.from("cr360_hr_employees").select("id,branch_id,display_name,position,employment_status").eq("auth_user_id", user.id).maybeSingle(),
  ]);

  if (!mem || !mem.active) {
    return { viewer: null, signedInWithoutMembership: true, displayName: emp?.display_name ?? null, employee: null, locale };
  }

  const employee = emp && emp.employment_status === "active" ? emp : null;
  const viewer: Viewer = {
    userId: user.id,
    grants: [{ role: mem.role as AppRole, branchId: mem.branch_id, active: mem.active }],
    employeeId: employee?.id ?? null,
    guardianOf: [], // guardian links arrive with proposed migration 0005
    partnerGrants: [], // partner grants arrive with proposed migration 0006
  };
  return { viewer, signedInWithoutMembership: false, displayName: employee?.display_name ?? null, employee, locale };
}
