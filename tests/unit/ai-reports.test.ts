import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import Anthropic from "@anthropic-ai/sdk";
import { AI_MODEL, draftReportsWithAI } from "@/lib/cr360/ai-reports";
import { buildDraftRequest, type LessonInfo } from "@/lib/cr360/reports";

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
  id: "msg_test", type: "message", role: "assistant", model: AI_MODEL, stop_reason, stop_sequence: null, stop_details: null,
  content: [{ type: "text", text }],
  usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
});

describe("AI parent-report drafting (SDK wiring, mocked network)", () => {
  it("sends a de-identified request with the expected model/settings and maps drafts back", async () => {
    const { client, calls } = fakeClient({ body: message(JSON.stringify({ reports: [
      { ref: "S1", en: "Your child did great.", lo: "ລູກຂອງທ່ານເຮັດໄດ້ດີ." },
      { ref: "S2", en: "Your child missed class.", lo: "ລູກຂອງທ່ານຂາດຮຽນ." },
    ] })) });
    const r = await draftReportsWithAI(buildDraftRequest(lesson, students), names, client);
    expect(r).toEqual({ ok: true, drafts: { p1: { en: "Your child did great.", lo: "ລູກຂອງທ່ານເຮັດໄດ້ດີ." }, p2: { en: "Your child missed class.", lo: "ລູກຂອງທ່ານຂາດຮຽນ." } } });
    expect(calls).toHaveLength(1);
    const b = calls[0].body;
    expect(calls[0].url).toContain("/v1/messages");
    expect(b.model).toBe("claude-opus-5-5");
    expect(b.fallbacks).toBe("default");
    expect((b.output_config as { effort: string }).effort).toBe("low");
    expect((b.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    expect(calls[0].headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    const sent = JSON.stringify(b.messages);
    expect(sent).not.toMatch(/Noy|Phommasak|Bounmy|p1|p2/);
    expect(sent).toContain("[child]");
  });

  it("refusal → ai_declined; malformed output → ai_failed; 429 → ai_busy; 500 → ai_failed", async () => {
    expect(await draftReportsWithAI(buildDraftRequest(lesson, students), names, fakeClient({ body: message("", "refusal") }).client)).toEqual({ ok: false, code: "ai_declined" });
    await expect(draftReportsWithAI(buildDraftRequest(lesson, students), names, fakeClient({ body: message("not json") }).client)).resolves.toEqual({ ok: false, code: "ai_failed" });
    expect(await draftReportsWithAI(buildDraftRequest(lesson, students), names, fakeClient({ status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "slow down" } } }).client)).toEqual({ ok: false, code: "ai_busy" });
    expect(await draftReportsWithAI(buildDraftRequest(lesson, students), names, fakeClient({ status: 500, body: { type: "error", error: { type: "api_error", message: "x" } } }).client)).toEqual({ ok: false, code: "ai_failed" });
  });

  it("refuses to send if a name survived de-identification (defence in depth)", async () => {
    const { client, calls } = fakeClient({ body: message("{}") });
    const req = buildDraftRequest(lesson, students);
    req.students[0].teacher_note = "Noy again"; // simulate a scrubbing bug
    expect(await draftReportsWithAI(req, names, client)).toEqual({ ok: false, code: "privacy_block" });
    expect(calls).toHaveLength(0);
  });

  it("without an API key and no injected client → ai_not_configured (template fallback in the UI)", async () => {
    const prev = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    expect(await draftReportsWithAI(buildDraftRequest(lesson, students), names)).toEqual({ ok: false, code: "ai_not_configured" });
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  });
});
