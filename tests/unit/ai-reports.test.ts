import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import Anthropic from "@anthropic-ai/sdk";
import { aiStatus, draftReportsWithAI, type AiStatus } from "@/lib/cr360/ai-reports";
import { buildDraftRequest, containsPII, scrubPII, type LessonInfo } from "@/lib/cr360/reports";

// Model ids are configuration (CR360_AI_MODEL), never hard-coded; tests use a placeholder.
const READY: AiStatus = { ready: true, model: "test-model-id", serverFallback: true };
const READY_NO_FALLBACK: AiStatus = { ready: true, model: "test-model-id", serverFallback: false };

// FICTIONAL data. No network: the real SDK is driven through an injected fetch.
const lesson: LessonInfo = { unit: "Unit 3", lesson_title: "Line follower", level: "L2", covered: "Noy calibrated sensors", next_plan: "Speed control" };
const students = [
  { packageId: "p1", name: "Noy Phommasak", rubric: { programming: 4 as const }, teacherNote: "Noy was patient", attendance: "Present" as const },
  { packageId: "p2", name: "Bounmy K.", rubric: {}, teacherNote: null, attendance: "Absent" as const },
];
const names = students.map((s) => s.name);

function fakeClient(reply: { status?: number; body: unknown }) {
  const calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json", "request-id": "req_test" } });
  };
  return { client: new Anthropic({ apiKey: "test-key", fetch, maxRetries: 0 }), calls };
}

const message = (text: string, stop_reason = "end_turn") => ({
  id: "msg_test", type: "message", role: "assistant", model: "test-model-id", stop_reason, stop_sequence: null, stop_details: null,
  content: [{ type: "text", text }],
  usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
});

describe("AI parent-report drafting (SDK wiring, mocked network)", () => {
  it("sends a de-identified request with the expected model/settings and maps drafts back", async () => {
    const { client, calls } = fakeClient({ body: message(JSON.stringify({ reports: [
      { ref: "S1", en: "Your child did great.", lo: "ລູກຂອງທ່ານເຮັດໄດ້ດີ." },
      { ref: "S2", en: "Your child missed class.", lo: "ລູກຂອງທ່ານຂາດຮຽນ." },
    ] })) });
    const r = await draftReportsWithAI(buildDraftRequest(lesson, students), names, client, READY);
    expect(r).toEqual({ ok: true, drafts: { p1: { en: "Your child did great.", lo: "ລູກຂອງທ່ານເຮັດໄດ້ດີ." }, p2: { en: "Your child missed class.", lo: "ລູກຂອງທ່ານຂາດຮຽນ." } } });
    expect(calls).toHaveLength(1);
    const b = calls[0].body;
    expect(calls[0].url).toContain("/v1/messages");
    expect(b.model).toBe("test-model-id");
    expect(b.fallbacks).toBe("default");
    expect((b.output_config as { effort: string }).effort).toBe("low");
    expect((b.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    expect(calls[0].headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    const sent = JSON.stringify(b.messages);
    expect(sent).not.toMatch(/Noy|Phommasak|Bounmy|p1|p2/);
    expect(sent).toContain("[child]");
  });

  it("refusal → ai_declined; malformed output → ai_failed; 429 → ai_busy; 500 → ai_failed", async () => {
    expect(await draftReportsWithAI(buildDraftRequest(lesson, students), names, fakeClient({ body: message("", "refusal") }).client, READY)).toEqual({ ok: false, code: "ai_declined" });
    await expect(draftReportsWithAI(buildDraftRequest(lesson, students), names, fakeClient({ body: message("not json") }).client, READY)).resolves.toEqual({ ok: false, code: "ai_failed" });
    expect(await draftReportsWithAI(buildDraftRequest(lesson, students), names, fakeClient({ status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "slow down" } } }).client, READY)).toEqual({ ok: false, code: "ai_busy" });
    expect(await draftReportsWithAI(buildDraftRequest(lesson, students), names, fakeClient({ status: 500, body: { type: "error", error: { type: "api_error", message: "x" } } }).client, READY)).toEqual({ ok: false, code: "ai_failed" });
  });

  it("refuses to send if a name survived de-identification (defence in depth)", async () => {
    const { client, calls } = fakeClient({ body: message("{}") });
    const req = buildDraftRequest(lesson, students);
    req.students[0].teacher_note = "Noy again"; // simulate a scrubbing bug
    expect(await draftReportsWithAI(req, names, client, READY)).toEqual({ ok: false, code: "privacy_block" });
    expect(calls).toHaveLength(0);
  });

  it("AI is OFF unless explicitly enabled, a model is configured and a key exists", async () => {
    expect(aiStatus({})).toEqual({ ready: false, reason: "disabled" });
    expect(aiStatus({ ANTHROPIC_API_KEY: "k", CR360_AI_MODEL: "m-1" })).toEqual({ ready: false, reason: "disabled" });
    expect(aiStatus({ CR360_AI_DRAFTS_ENABLED: "true", ANTHROPIC_API_KEY: "k" })).toEqual({ ready: false, reason: "no_model" });
    expect(aiStatus({ CR360_AI_DRAFTS_ENABLED: "true", CR360_AI_MODEL: "bad model id!" , ANTHROPIC_API_KEY: "k" })).toEqual({ ready: false, reason: "no_model" });
    expect(aiStatus({ CR360_AI_DRAFTS_ENABLED: "true", CR360_AI_MODEL: "m-1" })).toEqual({ ready: false, reason: "no_key" });
    expect(aiStatus({ CR360_AI_DRAFTS_ENABLED: "true", CR360_AI_MODEL: "m-1", ANTHROPIC_API_KEY: "k" })).toEqual({ ready: true, model: "m-1", serverFallback: false });
    const { client, calls } = fakeClient({ body: message("{}") });
    expect(await draftReportsWithAI(buildDraftRequest(lesson, students), names, client, { ready: false, reason: "disabled" })).toEqual({ ok: false, code: "ai_not_configured" });
    expect(calls).toHaveLength(0);
  });

  it("server-side fallback beta is sent only when configured", async () => {
    const { client, calls } = fakeClient({ body: message(JSON.stringify({ reports: [] })) });
    await draftReportsWithAI(buildDraftRequest(lesson, students), names, client, READY_NO_FALLBACK);
    expect(calls[0].body.fallbacks).toBeUndefined();
    expect(calls[0].headers.get("anthropic-beta") ?? "").not.toContain("server-side-fallback");
  });

  it("free text is de-identified beyond names: phones, e-mails, links, codes, dates, guardians", async () => {
    const noisy: LessonInfo = { unit: "Unit 3", lesson_title: "Line follower for TST-001", level: "L2",
      covered: "Mum (Mrs Kham Vongsa) called from 020 5512 3456, see https://example.test/x", next_plan: "Email kham@example.test before 12/05/2026" };
    const req = buildDraftRequest(noisy, [{ ...students[0], teacherNote: "Born 2019-03-04; ID 1234567; parent Kham says hi" }], ["Kham Vongsa"]);
    const all = JSON.stringify(req);
    expect(all).not.toMatch(/5512|3456|example\.test|TST-001|2019-03-04|1234567|12\/05\/2026|Kham|Vongsa/);
    expect(containsPII(all)).toBe(false);
    expect(scrubPII("Lesson 3 of 12, level L2, Spike Prime")).toBe("Lesson 3 of 12, level L2, Spike Prime");
    const { client, calls } = fakeClient({ body: message("{}") });
    const bad = buildDraftRequest(lesson, students);
    bad.students[0].teacher_note = "call 020 5512 3456"; // simulate a scrubbing bug
    expect(await draftReportsWithAI(bad, names, client, READY)).toEqual({ ok: false, code: "privacy_block" });
    expect(calls).toHaveLength(0);
  });
});
