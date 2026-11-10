import "server-only";
import type { ZodType } from "zod";
import { loadViewer } from "./viewer";
import { supabaseServer } from "./supabase-server";

export function jsonError(status: number, reasonCode: string, extra?: Record<string, unknown>) {
  return Response.json({ status: "rejected", reasonCode, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Same-origin check for state-changing requests (CSRF defence in depth on top of SameSite cookies). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

/** Parse + validate body; never trust client-supplied ownership. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: jsonError(400, "validation") };
  }
  const r = schema.safeParse(raw);
  if (!r.success) return { ok: false, res: jsonError(400, "validation", { issues: r.error.issues.map((i) => ({ path: i.path, message: i.message })) }) };
  return { ok: true, data: r.data };
}

/** Requires a signed-in user with an active cr360 membership AND an active self-linked employee row. */
export async function requireSelfEmployee(req: Request) {
  if (!sameOrigin(req)) return { ok: false as const, res: jsonError(403, "bad_origin") };
  const ctx = await loadViewer();
  if (!ctx.viewer) return { ok: false as const, res: jsonError(401, ctx.signedInWithoutMembership ? "no_membership" : "unauthenticated") };
  if (!ctx.employee) return { ok: false as const, res: jsonError(403, "not_employee") };
  const sb = await supabaseServer();
  return { ok: true as const, ctx, employee: ctx.employee, sb };
}
