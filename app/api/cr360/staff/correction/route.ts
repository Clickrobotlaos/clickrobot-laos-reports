import { CorrectionInput } from "@/lib/cr360/schemas";
import { jsonError, jsonOk, parseBody, requireSelfEmployee } from "@/lib/cr360/api";

/** POST /api/cr360/staff/correction — appends a request; original punches are never modified. */
export async function POST(req: Request) {
  const auth = await requireSelfEmployee(req);
  if (!auth.ok) return auth.res;
  const body = await parseBody(req, CorrectionInput);
  if (!body.ok) return body.res;
  const { data, error } = await auth.sb
    .from("cr360_hr_correction_requests")
    .insert({
      employee_id: auth.employee.id,
      branch_id: auth.employee.branch_id,
      work_date: body.data.workDate,
      correction_type: body.data.type,
      reason: body.data.reason,
    })
    .select("id")
    .single();
  if (error) return jsonError(error.code === "42501" ? 403 : 422, "insert_failed");
  return jsonOk({ status: "pending", id: data.id }, 201);
}
