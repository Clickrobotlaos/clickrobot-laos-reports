import { rpcErrorCode } from "./rpc-errors";

/** Map errors from public.cr360_hr_decide_request (proposed migration 0004) to stable codes. */
export function decisionErrorCode(err: { code?: string; message?: string }): { code: string; status: number } {
  if ((err.message ?? "").toLowerCase().includes("own request")) return { code: "self_decision", status: 403 };
  return rpcErrorCode(err);
}
