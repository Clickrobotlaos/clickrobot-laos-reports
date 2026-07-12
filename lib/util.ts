export const CURRENCIES = ["LAK", "USD", "THB"] as const;
export const PROGRAMS_FALLBACK = ["DUPLO Mata", "LEGO Essential", "LEGO Spike Prime", "VEX IQ Robotics"];
export const STUDENT_TYPES = ["New", "Extension", "Trial", "Trial Converted"];
export const PAYMENT_TYPES = ["New Registration", "Extension", "Trial Fee", "Other"];
export const EXPENSE_CATEGORIES = ["Rent", "Salary", "Marketing", "Equipment", "Utilities", "Transportation", "Stationery", "Event Cost", "Maintenance", "Other"];
export const PAYMENT_METHODS = ["Cash", "Bank Transfer", "QR Payment", "Other"];
export const STAFF_STATUS = ["Active", "On leave", "Terminated"];

export const ROLE_LABELS: Record<string, string> = {
  admin: "CEO / Admin",
  co_admin: "Operations Manager",
  manager: "Operations Manager",
  finance: "Finance / Admin",
  staff: "Full-time Staff",
  viewer: "Viewer",
  contractor: "Contractor / Part-time",
};

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function monthStr() { return todayStr().slice(0, 7); }
export function uid() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

export function toLAK(amount: any, rate: any) { return (Number(amount) || 0) * (Number(rate) || 0); }

export function fmt(n: any, cur = "LAK") {
  const num = Number(n) || 0;
  const dec = cur === "LAK" ? 0 : 2;
  return num.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
export function money(lak: number, cur: string, rates: Record<string, number>) {
  const r = rates[cur] || 1;
  return `${fmt(lak / r, cur)} ${cur}`;
}

export type Perms = {
  submit: boolean;
  addRecords: boolean;
  approve: boolean;
  payroll: boolean;
  settings: boolean;
  dashboard: boolean;
  staff: boolean;
  fullDashboard: boolean;
  attendance: boolean;
  monthlyReport: boolean;   // NEW — access to monthly PDF report
  netProfit: boolean;        // NEW — see net profit card on dashboard
  ceoSalary: boolean;        // NEW — see CEO's salary in payroll/staff
  viewInvoices: boolean;     // can view invoices list (read-only for manager)
  financialData: boolean;    // sees expenses, income totals, financial charts
};

export const PERMS: Record<string, Perms> = {
  admin:      { submit: true,  addRecords: true,  approve: true,  payroll: true,  settings: true,  dashboard: true, staff: true,  fullDashboard: true,  attendance: true, monthlyReport: true,  netProfit: true,  ceoSalary: true,  viewInvoices: true,  financialData: true  },
  co_admin:   { submit: true,  addRecords: true,  approve: true,  payroll: true,  settings: true,  dashboard: true, staff: true,  fullDashboard: true,  attendance: true, monthlyReport: false, netProfit: false, ceoSalary: false, viewInvoices: true,  financialData: true  },
  manager:    { submit: false, addRecords: false, approve: true,  payroll: false, settings: false, dashboard: true, staff: false, fullDashboard: false, attendance: true, monthlyReport: false, netProfit: false, ceoSalary: false, viewInvoices: true,  financialData: false },
  finance:    { submit: false, addRecords: true,  approve: false, payroll: true,  settings: false, dashboard: true, staff: false, fullDashboard: true,  attendance: true, monthlyReport: false, netProfit: false, ceoSalary: false, viewInvoices: true,  financialData: true  },
  staff:      { submit: true,  addRecords: false, approve: false, payroll: false, settings: false, dashboard: true, staff: false, fullDashboard: false, attendance: true, monthlyReport: false, netProfit: false, ceoSalary: false, viewInvoices: false, financialData: false },
  viewer:     { submit: false, addRecords: false, approve: false, payroll: false, settings: false, dashboard: true, staff: false, fullDashboard: false, attendance: false, monthlyReport: false, netProfit: false, ceoSalary: false, viewInvoices: false, financialData: false },
  contractor: { submit: false, addRecords: false, approve: false, payroll: false, settings: false, dashboard: false, staff: false, fullDashboard: false, attendance: false, monthlyReport: false, netProfit: false, ceoSalary: false, viewInvoices: false, financialData: false },
};

export const isAdminLevel = (role: string) => role === "admin";
export const isAdminish = (role: string) => role === "admin" || role === "co_admin";

export function emptyProgramStats(programs: string[]) {
  return Object.fromEntries(programs.map((p) => [p, { newS: 0, ext: 0, trial: 0, conv: 0 }]));
}

export function csvDownload(name: string, rows: any[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (x: any) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  a.click();
}

export function copyText(t: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(t);
  const ta = document.createElement("textarea");
  ta.value = t; document.body.appendChild(ta); ta.select();
  document.execCommand("copy"); document.body.removeChild(ta);
  return Promise.resolve();
}
