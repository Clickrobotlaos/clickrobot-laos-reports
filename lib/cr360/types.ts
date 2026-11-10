/**
 * ClickRobot 360 — shared domain types.
 * Roles are ALWAYS derived server-side from trusted membership rows
 * (public.cr360_hr_memberships today; proposed cr360 grants later),
 * never from user-editable JWT metadata or a UI dropdown.
 */

/** Roles stored in the deployed v0.4 table public.cr360_hr_memberships. */
export const HR_ROLES = ["ceo", "hr", "manager", "staff"] as const;
export type HrRole = (typeof HR_ROLES)[number];

/** Full target role set (some require proposed migrations before they exist in the DB). */
export const APP_ROLES = [
  "ceo", "partner", "hr", "finance", "manager", "teacher", "reception",
  "staff", "guardian", "school_partner", "franchise_admin",
] as const;
export type AppRole = (typeof APP_ROLES)[number];

export type Currency = "LAK" | "THB" | "USD";

/** Authorization context. Built only from database rows on the server. */
export interface Viewer {
  userId: string;
  /** One row per explicit grant. Multi-branch HQ staff get multiple grants. */
  grants: Grant[];
  /** HR employee row linked to auth.uid(), if any. */
  employeeId?: string | null;
  /** Students this user is a VERIFIED, ACTIVE guardian of. */
  guardianOf?: string[];
  /** Explicit partner/investor finance grants (entity + validity window). */
  partnerGrants?: PartnerGrant[];
}

export interface Grant {
  role: AppRole;
  /** null = organisation-wide (only meaningful for ceo / hr / finance). */
  branchId: string | null;
  active: boolean;
}

export interface PartnerGrant {
  entityId: string;
  /** ISO dates, inclusive. */
  validFrom: string;
  validTo: string;
  scopes: ("executive_report" | "distributions" | "investment")[];
}

export type Workspace = "ceo" | "manager" | "staff" | "parent" | "finance" | "schools";
