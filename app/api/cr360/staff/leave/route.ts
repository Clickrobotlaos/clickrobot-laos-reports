import { LeaveInput } from "@/lib/cr360/schemas";
import { jsonError, jsonOk, parseBody, requireSelfEmployee } from "@/lib/cr360/api";

/** POST /api/cr360/staff/leave — self submission. RLS policy cr360_leave_self_insert forces status=pending, self employee. */
export async function POST(req: Request) {
  const auth = await requireSelfEmployee(req);
  if (!auth.ok) return auth.res;
  const body = await parseBody(req, LeaveInput);
  if (!body.ok) return body.res;
  const { data, error } = await auth.sb
    .from("cr360_hr_leave_requests")
    .insert({
      employee_id: auth.employee.id,
      branch_id: auth.employee.branch_id,
      leave_type: body.data.type,
      start_date: body.data.startDate,
      end_date: body.data.endDate,
      reason: body.data.reason,
    })
    .select("id,status")
    .single();
  if (error) return jsonError(error.code === "42501" ? 403 : 422, "insert_failed");
  return jsonOk({ status: "pending", id: data.id }, 201);
}
