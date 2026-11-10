// Auth-boundary smoke test against a running build (no credentials needed, no data written).
// Usage: BASE_URL=http://localhost:3000 node tests/e2e/boundary-smoke.mjs
const B = process.env.BASE_URL ?? "http://localhost:3000";
const j = { "content-type": "application/json" };
const clock = JSON.stringify({ action: "in", latitude: 1, longitude: 1, reportedAccuracyM: 5, nonce: "12345678" });

const cases = [
  ["anon /360/staff redirects to /login", async () => {
    const r = await fetch(`${B}/360/staff`, { redirect: "manual" });
    return r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").includes("/login");
  }],
  ...["/360/students", "/360/students/TST-001", "/360/parent", "/360/manager", "/360/ceo"].map((path) => [`anon ${path} redirects to /login`, async () => {
    const r = await fetch(`${B}${path}`, { redirect: "manual" });
    return r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").includes("/login");
  }]),
  ["anon GET /api/cr360/me → 401", async () => (await fetch(`${B}/api/cr360/me`)).status === 401],
  ["POST clock without Origin → 403", async () => (await fetch(`${B}/api/cr360/staff/clock`, { method: "POST", headers: j, body: clock })).status === 403],
  ["POST clock cross-site Origin → 403", async () => (await fetch(`${B}/api/cr360/staff/clock`, { method: "POST", headers: { ...j, origin: "https://evil.example" }, body: clock })).status === 403],
  ["POST clock same-origin anon → 401", async () => (await fetch(`${B}/api/cr360/staff/clock`, { method: "POST", headers: { ...j, origin: B }, body: clock })).status === 401],
  ["POST leave anon → 401", async () => (await fetch(`${B}/api/cr360/staff/leave`, { method: "POST", headers: { ...j, origin: B }, body: "{}" })).status === 401],
  ["POST approval decision cross-site → 403", async () => (await fetch(`${B}/api/cr360/approvals/decision`, { method: "POST", headers: { ...j, origin: "https://evil.example" }, body: "{}" })).status === 403],
  ["POST approval decision anon → 401", async () => (await fetch(`${B}/api/cr360/approvals/decision`, { method: "POST", headers: { ...j, origin: B }, body: JSON.stringify({ kind: "leave", id: "60000000-0000-4000-8000-0000000000a2", action: "approve" }) })).status === 401],
  ["locale rejects unknown value → 400", async () => (await fetch(`${B}/api/cr360/locale`, { method: "POST", headers: { ...j, origin: B }, body: JSON.stringify({ locale: "fr" }) })).status === 400],
  ["legacy /login still served → 200", async () => (await fetch(`${B}/login`)).status === 200],
];

let failed = 0;
for (const [name, fn] of cases) {
  let ok = false;
  try { ok = await fn(); } catch (e) { console.error(e); }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
