/**
 * Small in-memory sliding-window limiter. Per server instance only (serverless → approximate);
 * it is a cost/abuse guardrail for AI drafting, not a billing quota.
 */
const hits = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
