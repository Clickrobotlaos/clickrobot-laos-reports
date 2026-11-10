/** Map errors from public.cr360_hr_decide_request (proposed migration 0004) to stable codes. */
export function decisionErrorCode(err: { code?: string; message?: string }): { code: string; status: number } {
  const c = err.code ?? "";
  const m = (err.message ?? "").toLowerCase();
  // Function not deployed yet (PostgREST schema cache miss / undefined function)
  if (c === "PGRST202" || c === "42883" || m.includes("could not find the function")) return { code: "not_enabled", status: 501 };
  if (c === "40001" || m.includes("already decided")) return { code: "already_decided", status: 409 };
  if (m.includes("own request")) return { code: "self_decision", status: 403 };
  if (c === "42501") return { code: "forbidden", status: 403 };
  if (c === "P0002") return { code: "not_found", status: 404 };
  if (c === "22023") return { code: "validation", status: 400 };
  if (c === "28000") return { code: "unauthenticated", status: 401 };
  return { code: "server_error", status: 500 };
}
