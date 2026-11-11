/** Map Postgres / PostgREST errors from cr360 RPCs to stable, non-leaky reason codes. */
export function rpcErrorCode(err: { code?: string; message?: string }): { code: string; status: number } {
  const c = err.code ?? "";
  const m = (err.message ?? "").toLowerCase();
  if (c === "PGRST202" || c === "42883" || m.includes("could not find the function")) return { code: "not_enabled", status: 501 };
  if (c === "23505") return { code: "duplicate", status: 409 };
  if (c === "23P01") return { code: "overlap", status: 409 };
  if (c === "40001") return { code: "already_decided", status: 409 };
  if (c === "P0002") return { code: "not_found", status: 404 };
  if (c === "22023") return { code: "validation", status: 400 };
  if (c === "28000") return { code: "unauthenticated", status: 401 };
  if (c === "42501") return { code: "forbidden", status: 403 };
  return { code: "server_error", status: 500 };
}
