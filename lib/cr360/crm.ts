/**
 * CRM pipeline over the LEGACY leads table (pure, no I/O).
 * Stage values match the DB check constraint leads_status_check exactly.
 * /360 supports the safe stage moves only; booking a trial (needs class + date) and registering
 * (needs a paid package) stay in the Records app so no half-finished conversion is ever created.
 */
export const STAGES = ["New", "Contacted", "TrialBooked", "TrialAttended", "Registered", "Lost"] as const;
export type Stage = (typeof STAGES)[number];
export const OPEN_STAGES: Stage[] = ["New", "Contacted", "TrialBooked", "TrialAttended"];

export type LeadAction = "contacted" | "attended" | "noshow" | "lost" | "reopen";

export interface Lead {
  id: string;
  student_name: string;
  parent_name: string | null;
  phone: string | null;
  age: number | null;
  branch_id: string | null;
  program_id: string | null;
  source: string | null;
  status: Stage | string;
  lost_reason: string | null;
  trial_date: string | null;
  last_contact_at: string | null;
  created_at: string | null;
}

export type ActionResult =
  | { ok: true; from: Stage; patch: Record<string, unknown>; activity: { action: string; note: string | null } }
  | { ok: false; code: "invalid_transition" | "reason_required" };

/** Same transitions and field changes the legacy leads page performs. `nowIso` injected for testability. */
export function planLeadAction(lead: Pick<Lead, "status">, action: LeadAction, nowIso: string, reason?: string): ActionResult {
  const from = lead.status as Stage;
  const r = reason?.trim() ?? "";
  switch (action) {
    case "contacted":
      if (from !== "New" && from !== "Contacted") return { ok: false, code: "invalid_transition" };
      return { ok: true, from, patch: { status: "Contacted", last_contact_at: nowIso }, activity: { action: "Contacted", note: null } };
    case "attended":
      if (from !== "TrialBooked") return { ok: false, code: "invalid_transition" };
      return { ok: true, from, patch: { status: "TrialAttended", trial_result: "Attended", last_contact_at: nowIso }, activity: { action: "Trial attended", note: null } };
    case "noshow":
      if (from !== "TrialBooked") return { ok: false, code: "invalid_transition" };
      return { ok: true, from, patch: { status: "Contacted", trial_result: "NoShow", trial_class_id: null, trial_date: null, last_contact_at: nowIso }, activity: { action: "Trial no-show", note: "Back to follow-up" } };
    case "lost":
      if (!OPEN_STAGES.includes(from)) return { ok: false, code: "invalid_transition" };
      if (r.length < 3) return { ok: false, code: "reason_required" };
      return { ok: true, from, patch: { status: "Lost", lost_reason: r.slice(0, 300), last_contact_at: nowIso }, activity: { action: "Marked lost", note: r.slice(0, 300) } };
    case "reopen":
      if (from !== "Lost") return { ok: false, code: "invalid_transition" };
      return { ok: true, from, patch: { status: "Contacted", lost_reason: null, last_contact_at: nowIso }, activity: { action: "Reopened", note: null } };
  }
}

/** Follow-up SLA defaults (configurable later in settings): New must be contacted within 24 h;
 * open leads need contact at least every 3 days; a booked trial in the past needs an outcome. */
export const SLA = { newHours: 24, followUpDays: 3 };

export type SlaFlag = "uncontacted" | "stale" | "trial_outcome_due" | null;

export function slaFlag(l: Pick<Lead, "status" | "created_at" | "last_contact_at" | "trial_date">, now: Date, today: string): SlaFlag {
  const t = now.getTime();
  if (l.status === "New" && l.created_at && t - Date.parse(l.created_at) > SLA.newHours * 3600e3) return "uncontacted";
  if (l.status === "TrialBooked" && l.trial_date && l.trial_date < today) return "trial_outcome_due";
  if ((OPEN_STAGES as string[]).includes(l.status) && l.status !== "New" && l.last_contact_at && t - Date.parse(l.last_contact_at) > SLA.followUpDays * 864e5) return "stale";
  return null;
}

export function funnel(leads: Pick<Lead, "status">[]) {
  const count = (s: Stage) => leads.filter((l) => l.status === s).length;
  const by = Object.fromEntries(STAGES.map((s) => [s, count(s)])) as Record<Stage, number>;
  const reachedTrial = by.TrialBooked + by.TrialAttended + by.Registered;
  const closed = by.Registered + by.Lost;
  return {
    by,
    total: leads.length,
    trialRate: leads.length ? reachedTrial / leads.length : null,
    winRate: closed ? by.Registered / closed : null,
  };
}
