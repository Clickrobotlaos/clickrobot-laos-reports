import { OtInput } from "@/lib/cr360/schemas";
import { jsonError, jsonOk, parseBody, requireSelfEmployee } from "@/lib/cr360/api";

/** POST /api/cr360/staff/ot — self request. No salary accrues until an authorised reviewer approves. */
export async function POST(req: Request) {
  const auth = await requireSelfEmployee(req);
  if (!auth.ok) return auth.res;
  const body = await parseBody(req, OtInput);
  if (!body.ok) return body.res;
  const { data, error } = await auth.sb
    .from("cr360_hr_ot_requests")
    .insert({
      employee_id: auth.employee.id,
      branch_id: auth.employee.branch_id,
      work_date: body.data.date,
      minutes: body.data.minutes,
      reason: body.data.reason,
    })
    .select("id")
    .single();
  if (error) return jsonError(error.code === "42501" ? 403 : 422, "insert_failed");
  return jsonOk({ status: "pending", id: data.id }, 201);
}
