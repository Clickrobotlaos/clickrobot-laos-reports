import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import Anthropic from "@anthropic-ai/sdk";
import { askNova, buildNovaRequest, type NovaFacts } from "@/lib/cr360/nova";
import type { AiStatus } from "@/lib/cr360/ai-reports";

const READY: AiStatus = { ready: true, model: "test-model-id", serverFallback: false };
const facts: NovaFacts = {
  childName: "Noy Phommasak", otherNames: ["Kham Vongsa"], program: "Spike Prime", sessionsLeft: 3,
  reports: [{ date: "2026-11-04", lesson: "Line follower", text: "Noy led the debugging. Call Kham on 020 5512 3456." }],
  upcoming: [{ date: "2026-11-12", time: "10:00", className: "Spike Prime A" }],
  achievements: [{ date: "2026-11-01", title: "Level 2 complete" }],
};
function fake(body: unknown, status = 200) {
  const calls: { body: Record<string, unknown> }[] = [];
  const fetch = async (_u: RequestInfo | URL, init?: RequestInit) => { calls.push({ body: JSON.parse(String(init?.body ?? "{}")) }); return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); };
  return { client: new Anthropic({ apiKey: "k", fetch, maxRetries: 0 }), calls };
}
const msg = (text: string, stop_reason = "end_turn") => ({ id: "m", type: "message", role: "assistant", model: "test-model-id", stop_reason, stop_sequence: null, stop_details: null,
  content: [{ type: "text", text }], usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } });

describe("NOVA parent assistant", () => {
  it("de-identifies context and question (names, guardian, phone)", () => {
    const r = buildNovaRequest(facts, "How is Noy doing? My number is 020 5512 3456");
    const all = r.context + r.question;
    expect(all).not.toMatch(/Noy|Phommasak|Kham|Vongsa|5512|3456/);
    expect(r.context).toContain("Sessions left in the current package: 3");
    expect(r.context).toContain("Level 2 complete");
  });
  it("sends one de-identified request to the configured model and returns the answer", async () => {
    const { client, calls } = fake(msg("Your child is doing well and led the debugging."));
    const r = await askNova(buildNovaRequest(facts, "How is my child doing?"), [facts.childName, ...facts.otherNames], READY, client);
    expect(r).toEqual({ ok: true, answer: "Your child is doing well and led the debugging." });
    expect(calls[0].body.model).toBe("test-model-id");
    expect(JSON.stringify(calls[0].body)).not.toMatch(/Noy|Kham|5512/);
  });
  it("off unless configured; refusal and errors handled; privacy block before any call", async () => {
    const { client, calls } = fake(msg("x"));
    expect(await askNova({ context: "c", question: "q" }, [], { ready: false, reason: "disabled" }, client)).toEqual({ ok: false, code: "ai_not_configured" });
    expect(await askNova({ context: "Noy did well", question: "q" }, ["Noy"], READY, client)).toEqual({ ok: false, code: "privacy_block" });
    expect(calls).toHaveLength(0);
    expect(await askNova({ context: "c", question: "q" }, [], READY, fake(msg("", "refusal")).client)).toEqual({ ok: false, code: "ai_declined" });
    expect(await askNova({ context: "c", question: "q" }, [], READY, fake({ type: "error", error: { type: "rate_limit_error", message: "x" } }, 429).client)).toEqual({ ok: false, code: "ai_busy" });
  });
});
