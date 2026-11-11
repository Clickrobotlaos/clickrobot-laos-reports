import "server-only";
import { hasRole } from "./access";
import { loadViewer } from "./viewer";
import { jsonError, sameOrigin } from "./api";

/** CEO / HR / manager only; the DB functions (0008) re-check branch access for the specific employee. */
export async function requireShiftAdmin(req: Request) {
  if (!sameOrigin(req)) return { ok: false as const, res: jsonError(403, "bad_origin") };
  const ctx = await loadViewer();
  if (!ctx.viewer) return { ok: false as const, res: jsonError(401, "unauthenticated") };
  if (!hasRole(ctx.viewer, ["ceo", "hr", "manager"])) return { ok: false as const, res: jsonError(403, "forbidden") };
  return { ok: true as const, ctx };
}
