// Renders every /360 page as each persona against the FAKE Supabase (tests/e2e/fake-supabase.mjs) and
// fails on HTTP errors, runtime/hydration errors, console errors, or missing expected text.
// Usage (see tests/e2e/README.md):
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=fake npm run build
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=fake npx next start -p 3400 &
//   BASE_URL=http://localhost:3400 SHOTS=/tmp/shots node tests/e2e/render.mjs
import { createRequire } from "node:module";
// Use the pre-installed Playwright (resolved via the global module path), not a project dependency.
const { chromium } = createRequire(import.meta.url)("playwright");
import { mkdirSync } from "node:fs";
import { start, TOKENS, sessionCookie } from "./fake-supabase.mjs";

const B = process.env.BASE_URL ?? "http://localhost:3400";
const SHOTS = process.env.SHOTS ?? "";
const NO_ACCESS = "You do not have access to this workspace.";

const CASES = [
  ["ceo", "/360", "ClickRobot 360"],
  ["ceo", "/360/ceo", "Active packages"],
  ["ceo", "/360/manager", "Pending requests"],
  ["ceo", "/360/students", "Test Child 1"],
  ["ceo", "/360/students/TST-001", "Session ledger"],
  ["ceo", "/360/classes", "Teacher double-booked"],
  ["ceo", "/360/crm", "Lead One"],
  ["ceo", "/360/finance", "NOT a reconciled ledger"],
  ["ceo", "/360/schools", "School partners"],
  ["ceo", "/360/parent", NO_ACCESS],
  ["mgr", "/360/manager", "TEST Teacher A"],
  ["mgr", "/360/students", "Showing your branch only."],
  ["mgr", "/360/students/TST-003", "Student not found, or not in your branch."],
  ["mgr", "/360/students/TST-001", "Parent access"],
  ["mgr", "/360/classes", "Spike Prime A"],
  ["mgr", "/360/crm", "Lead Two"],
  ["mgr", "/360/staff", "My StaffOS"],
  ["mgr", "/360/finance", NO_ACCESS],
  ["mgr", "/360/ceo", NO_ACCESS],
  ["staff", "/360/staff", "Attendance (last 30 days)"],
  ["staff", "/360/students", NO_ACCESS],
  ["staff", "/360/crm", NO_ACCESS],
  ["parent", "/360/parent", "Test Child 1"],
  ["parent", "/360/parent?child=TST-002", "Test Child 2"],
  ["parent", "/360/staff", NO_ACCESS],
  ["parent", "/360/students/TST-001", NO_ACCESS],
];
// Negative content checks: text that must NOT appear for a persona/page.
const MUST_NOT = [
  ["mgr", "/360/students", "Test Child 3"],      // branch-B child hidden from branch-A manager
  ["mgr", "/360/crm", "Lead Three"],             // branch-B lead hidden
  ["mgr", "/360/classes", "VEX IQ Team"],        // other-branch class name hidden even in conflicts
  ["staff", "/360/staff", "LAK"],                // no money shown to staff
  ["parent", "/360/parent", "Lead One"],
];

const fake = await start(54399);
const browser = await chromium.launch();
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let failed = 0;

async function open(persona, path, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const cookies = [{ name: "sb-localhost-auth-token", value: sessionCookie(TOKENS[persona]), url: B }];
  if (opts.lo) cookies.push({ name: "cr360_locale", value: "lo", url: B });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  // Ignored: favicon/404/401 resource noise, and 406 from the LEGACY AppProvider's users .single() lookup,
  // which real Supabase also returns for accounts without a legacy staff row (e.g. parents). Harmless.
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource.*(404|401|406)/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  const res = await page.goto(B + path, { waitUntil: "networkidle" });
  const text = await page.locator("body").innerText();
  return { ctx, page, res, text, errors };
}

for (const [persona, path, expect] of CASES) {
  const { ctx, page, res, text, errors } = await open(persona, path);
  const problems = [];
  if (!res || res.status() !== 200) problems.push(`HTTP ${res?.status()}`);
  if (/Application error|Unhandled Runtime Error|Internal Server Error/i.test(text)) problems.push("runtime error page");
  // Case-insensitive: some labels use CSS text-transform: uppercase, which innerText reflects.
  if (!text.toLowerCase().includes(expect.toLowerCase())) problems.push(`missing "${expect}"`);
  problems.push(...errors);
  if (SHOTS) {
    const name = `${persona}${path.replace(/[/?=]/g, "_")}`;
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${persona.padEnd(6)} ${path}${problems.length ? "  → " + problems.join("; ") : ""}`);
  if (problems.length) failed++;
  await ctx.close();
}

for (const [persona, path, forbidden] of MUST_NOT) {
  const { ctx, text } = await open(persona, path);
  const leak = text.toLowerCase().includes(forbidden.toLowerCase());
  console.log(`${leak ? "FAIL" : "PASS"}  ${persona.padEnd(6)} ${path} does not show "${forbidden}"`);
  if (leak) failed++;
  await ctx.close();
}

// Lao locale + mobile layout (no horizontal overflow) on representative pages.
for (const [persona, path, lao] of [["ceo", "/360/ceo", "ແພັກເກດທີ່ໃຊ້ງານ"], ["staff", "/360/staff", "ລົງເວລາ"], ["parent", "/360/parent", "ຄັ້ງຮຽນທີ່ເຫຼືອ"], ["mgr", "/360/classes", "ຕາຕະລາງປະຈຳອາທິດ"], ["mgr", "/360/crm", "ຕິດຕໍ່ແລ້ວ"]]) {
  const { ctx, page, text, errors } = await open(persona, path, { lo: true, mobile: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  const problems = [...errors];
  if (!text.includes(lao)) problems.push(`missing Lao "${lao}"`);
  if (overflow) problems.push("horizontal page overflow at 390px");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mobile-lo-${persona}${path.replace(/\//g, "_")}.png`, fullPage: true });
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${persona.padEnd(6)} ${path} [lo, 390px]${problems.length ? "  → " + problems.join("; ") : ""}`);
  if (problems.length) failed++;
  await ctx.close();
}

await browser.close();
fake.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL RENDER CHECKS PASSED");
process.exit(failed ? 1 : 0);
