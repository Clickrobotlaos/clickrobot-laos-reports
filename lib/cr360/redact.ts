/**
 * Field-level redaction. RLS is row-level only; it cannot hide columns.
 * Any HR/staff object leaving the server passes through here unless the caller
 * holds a payroll grant for that row.
 */
export const MONEY_AND_IDENTITY_FIELDS = [
  "base_salary", "salary_currency", "bank_name", "bank_account_no", "id_card",
  "base", "bonus", "benefits", "overtime", "deductions", "net", "net_lak",
  "monthly_base_lak", "amount_lak", "rate_to_lak", "contract_url",
] as const;

export function redactMoney<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(row)) {
    if ((MONEY_AND_IDENTITY_FIELDS as readonly string[]).includes(k)) continue;
    out[k] = val;
  }
  return out as Partial<T>;
}

/** Safe directory projection: explicit allow-list (preferred over deny-list). */
export const SAFE_DIRECTORY_COLUMNS = [
  "id", "display_name", "position", "branch_id", "employment_status", "employee_code", "start_date",
] as const;

export function safeDirectoryRow(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of SAFE_DIRECTORY_COLUMNS) if (k in row) out[k] = row[k];
  return out;
}
