import { describe, expect, it } from "vitest";
import { funnel, planLeadAction, slaFlag, STAGES } from "@/lib/cr360/crm";
import { LeadActionInput } from "@/lib/cr360/schemas";

const now = "2026-11-10T10:00:00.000Z";

describe("lead stage transitions (match legacy leads page)", () => {
  it("stages match the DB check constraint", () => {
    expect([...STAGES]).toEqual(["New", "Contacted", "TrialBooked", "TrialAttended", "Registered", "Lost"]);
  });
  it("contacted from New/Contacted only", () => {
    expect(planLeadAction({ status: "New" }, "contacted", now)).toMatchObject({ ok: true, patch: { status: "Contacted", last_contact_at: now } });
    expect(planLeadAction({ status: "TrialBooked" }, "contacted", now)).toEqual({ ok: false, code: "invalid_transition" });
  });
  it("trial outcome only from TrialBooked; no-show clears the trial", () => {
    expect(planLeadAction({ status: "TrialBooked" }, "attended", now)).toMatchObject({ ok: true, patch: { status: "TrialAttended", trial_result: "Attended" } });
    expect(planLeadAction({ status: "TrialBooked" }, "noshow", now)).toMatchObject({ ok: true, patch: { status: "Contacted", trial_class_id: null, trial_date: null } });
    expect(planLeadAction({ status: "New" }, "attended", now).ok).toBe(false);
  });
  it("lost needs a reason and an open stage; Registered can never be lost from /360", () => {
    expect(planLeadAction({ status: "Contacted" }, "lost", now, " ")).toEqual({ ok: false, code: "reason_required" });
    expect(planLeadAction({ status: "Contacted" }, "lost", now, "price too high")).toMatchObject({ ok: true, patch: { status: "Lost", lost_reason: "price too high" } });
    expect(planLeadAction({ status: "Registered" }, "lost", now, "x".repeat(10)).ok).toBe(false);
  });
  it("reopen only from Lost; nothing in /360 can set Registered or TrialBooked", () => {
    expect(planLeadAction({ status: "Lost" }, "reopen", now)).toMatchObject({ ok: true, patch: { status: "Contacted", lost_reason: null } });
    for (const s of STAGES) for (const a of ["contacted", "attended", "noshow", "lost", "reopen"] as const) {
      const r = planLeadAction({ status: s }, a, now, "a reason");
      if (r.ok) expect(["Registered", "TrialBooked"]).not.toContain(r.patch.status);
    }
  });
});

describe("follow-up SLA", () => {
  const n = new Date(now);
  it("flags uncontacted new leads after 24h, stale follow-ups after 3 days, overdue trial outcomes", () => {
    expect(slaFlag({ status: "New", created_at: "2026-11-09T09:00:00Z", last_contact_at: null, trial_date: null }, n, "2026-11-10")).toBe("uncontacted");
    expect(slaFlag({ status: "New", created_at: "2026-11-10T01:00:00Z", last_contact_at: null, trial_date: null }, n, "2026-11-10")).toBeNull();
    expect(slaFlag({ status: "Contacted", created_at: null, last_contact_at: "2026-11-06T09:00:00Z", trial_date: null }, n, "2026-11-10")).toBe("stale");
    expect(slaFlag({ status: "TrialBooked", created_at: null, last_contact_at: now, trial_date: "2026-11-09" }, n, "2026-11-10")).toBe("trial_outcome_due");
    expect(slaFlag({ status: "Lost", created_at: "2020-01-01T00:00:00Z", last_contact_at: "2020-01-01T00:00:00Z", trial_date: null }, n, "2026-11-10")).toBeNull();
  });
});

describe("funnel", () => {
  it("computes counts, trial rate and win rate; empty-safe", () => {
    const f = funnel([{ status: "New" }, { status: "TrialBooked" }, { status: "Registered" }, { status: "Lost" }]);
    expect(f.by.New).toBe(1);
    expect(f.trialRate).toBe(0.5);
    expect(f.winRate).toBe(0.5);
    expect(funnel([]).trialRate).toBeNull();
  });
});

describe("lead action contract", () => {
  it("requires expectedStatus (optimistic concurrency) and rejects unknown actions/fields", () => {
    const id = "60000000-0000-4000-8000-0000000000a2";
    expect(LeadActionInput.safeParse({ leadId: id, action: "contacted", expectedStatus: "New" }).success).toBe(true);
    expect(LeadActionInput.safeParse({ leadId: id, action: "contacted" }).success).toBe(false);
    expect(LeadActionInput.safeParse({ leadId: id, action: "register", expectedStatus: "New" }).success).toBe(false);
    expect(LeadActionInput.safeParse({ leadId: id, action: "contacted", expectedStatus: "New", status: "Registered" }).success).toBe(false);
  });
});
