// NON-PRODUCTION TEST DOUBLE. A tiny stand-in for Supabase Auth + PostgREST so the real Next.js
// build can be rendered end-to-end as different personas without any real account or database.
// All data below is FICTIONAL. It implements only what /360 uses: GET /auth/v1/user, table reads with
// eq/in/gte/lt/order/offset/limit, single-object responses, and a few RPCs. It does NOT emulate RLS —
// authorisation is covered by tests/db (real Postgres) and tests/unit; this checks rendering only.
import http from "node:http";

const A = "10000000-0000-4000-8000-00000000000a", B = "10000000-0000-4000-8000-00000000000b";
const U = { ceo: "00000000-0000-4000-8000-0000000000c0", mgr: "00000000-0000-4000-8000-0000000000a1", staff: "00000000-0000-4000-8000-0000000000a2", parent: "00000000-0000-4000-8000-0000000000e1" };
export const TOKENS = { ceo: "tok-ceo", mgr: "tok-mgr", staff: "tok-staff", parent: "tok-parent" };
const USERS = Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [v, { id: U[k], aud: "authenticated", role: "authenticated", email: `${k}@test.invalid`, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" }]));

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Vientiane" }).format(new Date());
const dow = new Date(today + "T00:00:00Z").getUTCDay();
const iso = (d) => new Date(Date.now() + d * 864e5).toISOString();
const PROG = "70000000-0000-4000-8000-000000000001";
const pk = (i, br, total, used, active = true) => ({ id: `30000000-0000-4000-8000-${String(i).padStart(12, "0")}`, student_id: `TST-${String(i).padStart(3, "0")}`, student_name: `Test Child ${i}`, branch_id: br, program_id: PROG, package: `${total} sessions`, sessions_total: total, sessions_used: used, base_sessions: total, bonus_sessions: 0, start_date: "2026-10-01", active, student_status: active ? "Active" : "Inactive", created_at: "2026-10-01T00:00:00Z" });

const DB = {
  branches: [{ id: A, name: "TEST Branch A", active: true }, { id: B, name: "TEST Branch B", active: true }],
  programs: [{ id: PROG, name: "TEST Spike Prime" }],
  users: [
    { id: U.ceo, name: "TEST CEO", position: "CEO", role: "admin", branch_id: null, status: "Active", photo_url: null },
    { id: U.mgr, name: "TEST Manager A", position: "Manager", role: "manager", branch_id: A, status: "Active", photo_url: null },
    { id: U.staff, name: "TEST Teacher A", position: "Teacher", role: "staff", branch_id: A, status: "Active", photo_url: null },
  ],
  cr360_hr_memberships: [
    { user_id: U.ceo, role: "ceo", branch_id: null, active: true },
    { user_id: U.mgr, role: "manager", branch_id: A, active: true },
    { user_id: U.staff, role: "staff", branch_id: A, active: true },
  ],
  cr360_hr_employees: [
    { id: "20000000-0000-4000-8000-0000000000a1", auth_user_id: U.mgr, branch_id: A, display_name: "TEST Manager A", position: "Branch manager", employment_status: "active", employee_code: "E-01", start_date: "2025-01-01" },
    { id: "20000000-0000-4000-8000-0000000000a2", auth_user_id: U.staff, branch_id: A, display_name: "TEST Teacher A", position: "Teacher", employment_status: "active", employee_code: "E-02", start_date: "2025-06-01" },
  ],
  cr360_hr_shifts: [
    { id: "s1", employee_id: "20000000-0000-4000-8000-0000000000a2", starts_at: iso(-3), ends_at: iso(-2.7), status: "completed" },
    { id: "s2", employee_id: "20000000-0000-4000-8000-0000000000a2", starts_at: iso(-2), ends_at: iso(-1.7), status: "completed" },
    { id: "s3", employee_id: "20000000-0000-4000-8000-0000000000a2", starts_at: iso(1), ends_at: iso(1.3), status: "scheduled" },
  ],
  cr360_hr_attendance_events: [{ id: "p1", employee_id: "20000000-0000-4000-8000-0000000000a2", kind: "out", occurred_at: iso(-2.75), distance_m: 4.2, reported_accuracy_m: 6.1, source: "browser_gps" }, { id: "p0", employee_id: "20000000-0000-4000-8000-0000000000a2", kind: "in", occurred_at: iso(-3.01), distance_m: 3.1, reported_accuracy_m: 5.0, source: "browser_gps" }],
  cr360_hr_sites: [],
  cr360_hr_leave_requests: [{ id: "60000000-0000-4000-8000-0000000000a2", employee_id: "20000000-0000-4000-8000-0000000000a2", leave_type: "annual", start_date: "2026-12-01", end_date: "2026-12-02", status: "pending", created_at: iso(-1) }],
  cr360_hr_ot_requests: [{ id: "61000000-0000-4000-8000-0000000000a2", employee_id: "20000000-0000-4000-8000-0000000000a2", work_date: today, minutes: 60, status: "pending", created_at: iso(-0.5) }],
  cr360_hr_correction_requests: [],
  student_packages: [pk(1, A, 8, 7), pk(2, A, 12, 3), pk(3, B, 8, 0), pk(4, A, 8, 8, false)],
  attendance: [
    ...Array.from({ length: 7 }, (_, i) => ({ id: `a1-${i}`, package_id: pk(1).id, date: `2026-10-${String(2 + i * 4).padStart(2, "0")}`, status: "Present", is_makeup: i === 3, class_id: null, created_at: "2026-10-02T03:00:00Z" })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `a2-${i}`, package_id: pk(2).id, date: `2026-10-${String(3 + i * 7).padStart(2, "0")}`, status: i === 1 ? "Absent" : "Present", is_makeup: false, class_id: null, created_at: "2026-10-03T03:00:00Z" })),
    { id: "a2-x", package_id: pk(2).id, date: today, status: "Present", is_makeup: false, class_id: null, created_at: iso(0) },
  ],
  classes: [
    { id: "40000000-0000-4000-8000-000000000001", name: "Spike Prime A", program_id: PROG, branch_id: A, teacher_id: U.staff, assistant_id: null, day_of_week: dow, start_time: "10:00:00", end_time: "11:30:00", room: "Room 1", capacity: 6, level: "L1", active: true },
    { id: "40000000-0000-4000-8000-000000000002", name: "VEX IQ Team", program_id: PROG, branch_id: B, teacher_id: U.staff, assistant_id: null, day_of_week: dow, start_time: "11:00:00", end_time: "12:00:00", room: "Lab", capacity: 4, level: "L2", active: true },
    { id: "40000000-0000-4000-8000-000000000003", name: "Duplo Explorers", program_id: PROG, branch_id: A, teacher_id: U.mgr, assistant_id: null, day_of_week: (dow + 2) % 7, start_time: "09:00:00", end_time: "10:00:00", room: "Room 2", capacity: 0, level: null, active: true },
  ],
  class_bookings: [
    ...[1, 2, 3, 4].map((i) => ({ id: `b${i}`, class_id: "40000000-0000-4000-8000-000000000001", package_id: pk(i).id, kind: "regular", makeup_date: null, status: "Confirmed" })),
    { id: "b5", class_id: "40000000-0000-4000-8000-000000000001", package_id: pk(3).id, kind: "makeup", makeup_date: today, status: "Confirmed" },
    ...[1, 2, 3, 4].map((i) => ({ id: `c${i}`, class_id: "40000000-0000-4000-8000-000000000002", package_id: pk(i).id, kind: "regular", makeup_date: null, status: "Confirmed" })),
  ],
  leads: [
    { id: "80000000-0000-4000-8000-000000000001", student_name: "Lead One", parent_name: "Parent One", phone: "020 0000 0001", age: 7, branch_id: A, program_id: PROG, source: "Facebook", status: "New", lost_reason: null, trial_date: null, last_contact_at: iso(-3), created_at: iso(-3) },
    { id: "80000000-0000-4000-8000-000000000002", student_name: "Lead Two", parent_name: "Parent Two", phone: "020 0000 0002", age: 9, branch_id: A, program_id: PROG, source: "Walk-in", status: "TrialBooked", lost_reason: null, trial_date: "2026-11-01", last_contact_at: iso(-1), created_at: iso(-10) },
    { id: "80000000-0000-4000-8000-000000000003", student_name: "Lead Three", parent_name: null, phone: null, age: null, branch_id: B, program_id: null, source: "Referral", status: "Lost", lost_reason: "Too far", trial_date: null, last_contact_at: iso(-20), created_at: iso(-30) },
    { id: "80000000-0000-4000-8000-000000000004", student_name: "Lead Four", parent_name: "Parent Four", phone: "020 0000 0004", age: 6, branch_id: A, program_id: PROG, source: "Phone", status: "Registered", lost_reason: null, trial_date: null, last_contact_at: iso(-5), created_at: iso(-40) },
  ],
  invoices: [
    { id: "i1", branch_id: A, status: "Sent", amount_lak: 1500000, due_date: "2026-11-01", date: "2026-10-25" },
    { id: "i2", branch_id: B, status: "Draft", amount_lak: 900000, due_date: "2026-12-15", date: today },
  ],
  income_records: [
    { id: "r1", date: `${today.slice(0, 7)}-02`, branch_id: A, amount: 2400000, currency: "LAK", rate_to_lak: 1, amount_lak: 2400000, unpaid_lak: 0, payment_method: "Cash" },
    { id: "r2", date: `${today.slice(0, 7)}-03`, branch_id: B, amount: 100, currency: "USD", rate_to_lak: 21950, amount_lak: 2195000, unpaid_lak: 0, payment_method: "Bank Transfer" },
    { id: "r3", date: `${today.slice(0, 7)}-04`, branch_id: A, amount: 1000, currency: "THB", rate_to_lak: 620, amount_lak: 600000, unpaid_lak: 20000, payment_method: "QR Payment" },
  ],
  expense_records: [
    { id: "x1", date: `${today.slice(0, 7)}-01`, branch_id: A, category: "Rent", amount: 3000000, currency: "LAK", rate_to_lak: 1, amount_lak: 3000000 },
    { id: "x2", date: `${today.slice(0, 7)}-05`, branch_id: B, category: "Equipment", amount: 450000, currency: "LAK", rate_to_lak: 1, amount_lak: 450000 },
  ],
  closed_months: [],
  settings: [],
};

const RPC = {
  staff_directory: () => DB.users,
  cr360_guardian_children: (uid) => uid === U.parent ? [
    { student_code: "TST-001", student_name: "Test Child 1", package_id: pk(1).id, program_name: "TEST Spike Prime", branch_name: "TEST Branch A", package: "8 sessions", sessions_total: 8, sessions_used: 7, active: true, start_date: "2026-10-01" },
    { student_code: "TST-002", student_name: "Test Child 2", package_id: pk(2).id, program_name: "TEST Spike Prime", branch_name: "TEST Branch A", package: "12 sessions", sessions_total: 12, sessions_used: 3, active: true, start_date: "2026-10-01" },
  ] : [],
  cr360_guardian_links_for: () => [
    { id: "90000000-0000-4000-8000-000000000001", guardian_email: "parent@test.invalid", relationship: "mother", created_at: iso(-2), verified_at: iso(-1), consent_version: "consent-test", revoked_at: null, revoke_reason: null },
    { id: "90000000-0000-4000-8000-000000000002", guardian_email: "grandpa@test.invalid", relationship: "grandparent", created_at: iso(-0.2), verified_at: null, consent_version: null, revoked_at: null, revoke_reason: null },
  ],
};

function applyFilters(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (["select", "order", "offset", "limit"].includes(k)) continue;
    const m = /^(eq|neq|gte|lt|lte|gt|in|is)\.(.*)$/.exec(v);
    if (!m) continue;
    const [, op, raw] = m;
    const val = raw === "null" ? null : raw === "true" ? true : raw === "false" ? false : raw;
    out = out.filter((r) => {
      const x = r[k] === undefined ? null : r[k];
      switch (op) {
        case "eq": return String(x) === String(val);
        case "neq": return String(x) !== String(val);
        case "is": return x === val;
        case "gte": return x !== null && String(x) >= String(val);
        case "gt": return x !== null && String(x) > String(val);
        case "lt": return x !== null && String(x) < String(val);
        case "lte": return x !== null && String(x) <= String(val);
        case "in": return raw.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(x));
      }
      return true;
    });
  }
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(",")[0].split(".");
    out = [...out].sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (dir === "desc" ? -1 : 1));
  }
  const offset = Number(params.get("offset") ?? 0), limit = params.get("limit");
  return out.slice(offset, limit === null ? undefined : offset + Number(limit));
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, accept, accept-profile, content-profile, prefer, range, x-client-info, x-supabase-api-version",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS, HEAD",
  "access-control-expose-headers": "content-range",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...CORS, ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

export function start(port) {
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
    const url = new URL(req.url, `http://localhost:${port}`);
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const user = USERS[token];
    if (url.pathname === "/auth/v1/user") return user ? send(res, 200, user) : send(res, 401, { code: 401, msg: "invalid JWT" });
    if (url.pathname.startsWith("/auth/v1/")) return send(res, 200, {});
    const rpc = /^\/rest\/v1\/rpc\/([a-z0-9_]+)$/.exec(url.pathname);
    if (rpc) {
      const fn = RPC[rpc[1]];
      if (!fn) return send(res, 404, { code: "PGRST202", message: `Could not find the function public.${rpc[1]}` });
      return send(res, 200, fn(user?.id));
    }
    const tbl = /^\/rest\/v1\/([a-z0-9_]+)$/.exec(url.pathname);
    if (tbl) {
      const rows = DB[tbl[1]];
      if (!rows) return send(res, 404, { code: "42P01", message: `relation ${tbl[1]} does not exist` });
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 403, { code: "42501", message: "fake: writes disabled" });
      const out = applyFilters(rows, url.searchParams);
      if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
        return out.length === 1 ? send(res, 200, out[0]) : send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${out.length} rows` });
      }
      return send(res, 200, out, { "content-range": `0-${Math.max(out.length - 1, 0)}/*` });
    }
    send(res, 404, { message: "not found" });
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

/** Cookie value @supabase/ssr expects for storage key sb-localhost-auth-token. */
export function sessionCookie(token) {
  const user = USERS[token];
  const session = { access_token: token, refresh_token: `r-${token}`, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  return "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.FAKE_SUPABASE_PORT ?? 54399);
  await start(port);
  console.log(`fake supabase on http://localhost:${port}`);
}
