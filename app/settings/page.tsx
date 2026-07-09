"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Shell } from "@/components/shell";
import { Field } from "@/components/ui";
import { collectAllData, collectMonthData, downloadAllAsCsv, wipeAllFinancialData, deepReset, nuclearReset } from "@/lib/backup";

export default function SettingsPage() {
  const app = useApp();
  if (app.loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (!app.userId) return null;
  if (app.role !== "admin") {
    return <Shell><div className="panel"><div className="empty">Only CEO / Admin can view settings.</div></div></Shell>;
  }
  return <Shell><SettingsView /></Shell>;
}

function SettingsView() {
  return (
    <div>
      <div className="sectionhead"><h2>Settings</h2></div>
      <CompanyPanel />
      <BankPanel />
      <TermsPanel />
      <RatesPanel />
      <BranchesPanel />
      <ProgramsPanel />
      <WhatsAppPanel />
      <CloseMonthPanel />
      <DangerZonePanel />
    </div>
  );
}

function CompanyPanel() {
  const [c, setC] = useState<any>({ name: "", address: "", phone: "", email: "", tax_id: "", logo_url: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    supabase.from("settings").select("value").eq("key", "company").maybeSingle().then(({ data }) => {
      if (data?.value) setC({ ...c, ...data.value });
    });
    // eslint-disable-next-line
  }, []);
  async function save() {
    setBusy(true); setMsg("");
    const { error } = await supabase.from("settings").upsert({ key: "company", value: c });
    setBusy(false);
    setMsg(error ? error.message : "Saved.");
  }
  return (
    <div className="panel">
      <h3>Company information (shown on invoices &amp; receipts)</h3>
      <div className="frow c2">
        <Field label="Official company name"><input value={c.name || ""} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="ClickRobot Laos Co., Ltd." /></Field>
        <Field label="Tax ID"><input value={c.tax_id || ""} onChange={(e) => setC({ ...c, tax_id: e.target.value })} /></Field>
        <Field label="Address"><input value={c.address || ""} onChange={(e) => setC({ ...c, address: e.target.value })} /></Field>
        <Field label="Phone"><input value={c.phone || ""} onChange={(e) => setC({ ...c, phone: e.target.value })} /></Field>
        <Field label="Email"><input type="email" value={c.email || ""} onChange={(e) => setC({ ...c, email: e.target.value })} /></Field>
        <Field label="Logo URL" hint="Paste a link to a hosted logo image (PNG/JPG).">
          <input value={c.logo_url || ""} onChange={(e) => setC({ ...c, logo_url: e.target.value })} placeholder="https://..." />
        </Field>
      </div>
      {msg && <div className={"banner " + (msg === "Saved." ? "ok" : "bad")}>{msg}</div>}
      <div className="btnrow"><button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save company info"}</button></div>
    </div>
  );
}

function BankPanel() {
  const [b, setB] = useState<any>({ bank_name: "", account_name: "", account_no: "", qr_url: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    supabase.from("settings").select("value").eq("key", "bank").maybeSingle().then(({ data }) => {
      if (data?.value) setB({ ...b, ...data.value });
    });
    // eslint-disable-next-line
  }, []);
  async function save() {
    setBusy(true); setMsg("");
    const { error } = await supabase.from("settings").upsert({ key: "bank", value: b });
    setBusy(false);
    setMsg(error ? error.message : "Saved.");
  }
  return (
    <div className="panel">
      <h3>Payment / bank details (shown on invoices)</h3>
      <div className="frow c2">
        <Field label="Bank name"><input value={b.bank_name || ""} onChange={(e) => setB({ ...b, bank_name: e.target.value })} placeholder="e.g. BCEL" /></Field>
        <Field label="Account name"><input value={b.account_name || ""} onChange={(e) => setB({ ...b, account_name: e.target.value })} /></Field>
        <Field label="Account number"><input value={b.account_no || ""} onChange={(e) => setB({ ...b, account_no: e.target.value })} /></Field>
        <Field label="QR code image URL" hint="Optional. Paste a link to a hosted image of your payment QR."><input value={b.qr_url || ""} onChange={(e) => setB({ ...b, qr_url: e.target.value })} placeholder="https://..." /></Field>
      </div>
      {msg && <div className={"banner " + (msg === "Saved." ? "ok" : "bad")}>{msg}</div>}
      <div className="btnrow"><button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save bank details"}</button></div>
    </div>
  );
}

function TermsPanel() {
  const [t, setT] = useState("Please pay within 7 days. Thank you.");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    supabase.from("settings").select("value").eq("key", "invoice_terms").maybeSingle().then(({ data }) => {
      if (typeof data?.value === "string") setT(data.value);
    });
  }, []);
  async function save() {
    setBusy(true); setMsg("");
    const { error } = await supabase.from("settings").upsert({ key: "invoice_terms", value: t });
    setBusy(false);
    setMsg(error ? error.message : "Saved.");
  }
  return (
    <div className="panel">
      <h3>Default invoice terms / notes</h3>
      <Field label="This text appears at the bottom of every unpaid invoice">
        <textarea rows={2} value={t} onChange={(e) => setT(e.target.value)} />
      </Field>
      {msg && <div className={"banner " + (msg === "Saved." ? "ok" : "bad")}>{msg}</div>}
      <div className="btnrow"><button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save terms"}</button></div>
    </div>
  );
}

function RatesPanel() {
  const app = useApp();
  const [usd, setUsd] = useState(app.rates.USD);
  const [thb, setThb] = useState(app.rates.THB);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { setUsd(app.rates.USD); setThb(app.rates.THB); }, [app.rates]);
  async function save() {
    setBusy(true); setMsg("");
    const inserts: any[] = [];
    if (Number(usd) && Number(usd) !== app.rates.USD) inserts.push({ currency: "USD", rate_to_lak: Number(usd), effective_date: new Date().toISOString().slice(0, 10), set_by: app.userId });
    if (Number(thb) && Number(thb) !== app.rates.THB) inserts.push({ currency: "THB", rate_to_lak: Number(thb), effective_date: new Date().toISOString().slice(0, 10), set_by: app.userId });
    if (inserts.length) {
      const { error } = await supabase.from("exchange_rates").insert(inserts);
      if (error) { setMsg(error.message); setBusy(false); return; }
      await app.refreshMeta();
      setMsg("Saved. New records will use these rates.");
    } else {
      setMsg("No changes.");
    }
    setBusy(false);
  }
  return (
    <div className="panel">
      <h3>Exchange rates (to LAK)</h3>
      <div className="frow c2">
        <Field label="1 USD = ? LAK"><input type="number" inputMode="decimal" value={usd} onChange={(e) => setUsd(Number(e.target.value))} /></Field>
        <Field label="1 THB = ? LAK"><input type="number" inputMode="decimal" value={thb} onChange={(e) => setThb(Number(e.target.value))} /></Field>
      </div>
      <div className="hint">Only CEO / Admin can change rates. New records use the current rate; older records stay at their original rate.</div>
      {msg && <div className="banner ok" style={{ marginTop: 10 }}>{msg}</div>}
      <div className="btnrow"><button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save rates"}</button></div>
    </div>
  );
}

function BranchesPanel() {
  const app = useApp();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    await supabase.from("branches").insert({ name: name.trim() });
    setBusy(false); setName(""); app.refreshMeta();
  }
  async function toggle(id: string, active: boolean) {
    await supabase.from("branches").update({ active }).eq("id", id);
    app.refreshMeta();
  }
  async function remove(id: string) {
    if (!confirm("Delete this branch permanently? Records using this branch will keep the name but the branch itself will be gone.")) return;
    const { error } = await supabase.from("branches").delete().eq("id", id);
    if (error) { alert("Delete failed: " + error.message); return; }
    app.refreshMeta();
  }
  return (
    <div className="panel">
      <h3>Branches</h3>
      <div className="frow c2">
        <Field label="Add branch">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New branch name" onKeyDown={(e) => e.key === "Enter" && add()} />
        </Field>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="btn sm" disabled={busy || !name.trim()} onClick={add}>Add branch</button>
        </div>
      </div>
      <div className="tblwrap" style={{ marginTop: 10 }}>
        <table className="tbl">
          <thead><tr><th>Branch</th><th></th></tr></thead>
          <tbody>{app.branches.map((b) => (
            <tr key={b.id}><td>{b.name}</td>
              <td style={{ display: "flex", gap: 6 }}>
                <button className="btn sm ghost" onClick={() => toggle(b.id, false)}>Deactivate</button>
                <button className="btn sm bad" onClick={() => remove(b.id)}>Delete</button>
              </td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function ProgramsPanel() {
  const app = useApp();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    await supabase.from("programs").insert({ name: name.trim() });
    setBusy(false); setName(""); app.refreshMeta();
  }
  async function remove(id: string) {
    if (!confirm("Delete this program permanently?")) return;
    const { error } = await supabase.from("programs").delete().eq("id", id);
    if (error) { alert("Delete failed: " + error.message); return; }
    app.refreshMeta();
  }
  return (
    <div className="panel">
      <h3>Programs</h3>
      <div className="frow c2">
        <Field label="Add program">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New program name" onKeyDown={(e) => e.key === "Enter" && add()} />
        </Field>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="btn sm" disabled={busy || !name.trim()} onClick={add}>Add program</button>
        </div>
      </div>
      <div className="tblwrap" style={{ marginTop: 10 }}>
        <table className="tbl">
          <thead><tr><th>Program</th><th></th></tr></thead>
          <tbody>{app.programs.map((p) => (
            <tr key={p.id}><td>{p.name}</td>
              <td><button className="btn sm bad" onClick={() => remove(p.id)}>Delete</button></td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function WhatsAppPanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  async function reload() {
    const { data } = await supabase.from("whatsapp_recipients").select("*").eq("active", true).order("label");
    setRows(data || []);
  }
  useEffect(() => { reload(); }, []);
  async function add() {
    if (!phone.trim()) return;
    await supabase.from("whatsapp_recipients").insert({ phone: phone.trim(), label: label.trim() || null });
    setPhone(""); setLabel(""); reload();
  }
  async function remove(id: string) {
    if (!confirm("Remove this WhatsApp recipient?")) return;
    await supabase.from("whatsapp_recipients").delete().eq("id", id);
    reload();
  }
  return (
    <div className="panel">
      <h3>WhatsApp recipients (for daily reports)</h3>
      <div className="frow c3">
        <Field label="Label"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. CEO" /></Field>
        <Field label="Phone (with country code)"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+85620..." /></Field>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="btn sm" disabled={!phone.trim()} onClick={add}>Add recipient</button>
        </div>
      </div>
      <div className="tblwrap" style={{ marginTop: 10 }}>
        <table className="tbl">
          <thead><tr><th>Label</th><th>Phone</th><th></th></tr></thead>
          <tbody>{rows.length ? rows.map((r) => (
            <tr key={r.id}><td>{r.label || "—"}</td><td>{r.phone}</td>
              <td><button className="btn sm bad" onClick={() => remove(r.id)}>Delete</button></td></tr>
          )) : <tr><td colSpan={3}><div className="empty">No recipients yet.</div></td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

function CloseMonthPanel() {
  const app = useApp();
  const [month, setMonth] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [confirmText, setConfirmText] = useState("");
  const [closedMonths, setClosedMonths] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const monthLabel = new Date(month + "-15").toLocaleString("en", { month: "long", year: "numeric" }).toUpperCase();
  const requiredPhrase = `CLOSE ${monthLabel}`;
  async function reload() {
    const { data } = await supabase.from("closed_months").select("*").order("month", { ascending: false });
    setClosedMonths(data || []);
  }
  useEffect(() => { reload(); }, []);
  async function close() {
    setBusy(true); setMsg("");
    try {
      const backup = await collectMonthData(month);
      downloadAllAsCsv(backup, `closed-${month}`);
      const counts: Record<string, number> = {};
      backup.forEach((t) => { counts[t.name] = t.rows.length; });
      const { error } = await supabase.from("closed_months").insert({
        month, closed_by: app.userId, record_counts: counts,
      });
      if (error) throw error;
      setMsg(`✓ ${monthLabel} is now closed. Backup CSV files downloaded.`);
      setConfirmText(""); reload();
    } catch (e: any) {
      setMsg(e.message || "Failed to close month.");
    }
    setBusy(false);
  }
  async function reopen(mo: string) {
    if (!window.confirm(`Reopen ${mo}?`)) return;
    const { error } = await supabase.from("closed_months").delete().eq("month", mo);
    if (error) { alert(error.message); return; }
    reload();
  }
  return (
    <div className="panel">
      <h3>Close month (monthly closing)</h3>
      <div className="hint" style={{ marginBottom: 10 }}>
        Locks all income, expenses, and daily reports for that month so they can&apos;t be edited by staff.
        A backup CSV is downloaded automatically before closing.
      </div>
      <div className="frow c2">
        <Field label="Month to close"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        <Field label={`Type "${requiredPhrase}" to confirm`}>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={requiredPhrase} />
        </Field>
      </div>
      {msg && <div className={"banner " + (msg.startsWith("✓") ? "ok" : "bad")}>{msg}</div>}
      <div className="btnrow">
        <button className="btn" disabled={busy || confirmText !== requiredPhrase} onClick={close}>
          {busy ? "Closing…" : `Close ${monthLabel}`}
        </button>
      </div>
      {closedMonths.length > 0 && (
        <>
          <h3 style={{ marginTop: 18 }}>Closed months</h3>
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr><th>Month</th><th>Closed at</th><th></th></tr></thead>
              <tbody>{closedMonths.map((c) => (
                <tr key={c.month}>
                  <td>{c.month}</td>
                  <td>{new Date(c.closed_at).toLocaleString()}</td>
                  <td><button className="btn sm ghost" onClick={() => reopen(c.month)}>Reopen</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Three-level Danger Zone ---------------- */

function DangerZonePanel() {
  return (
    <div className="panel" style={{ borderColor: "var(--bad)", borderWidth: 2 }}>
      <h3 style={{ color: "var(--bad)" }}>⚠️ Danger zone — data reset</h3>
      <div className="hint" style={{ marginBottom: 12 }}>
        Three levels of reset. All three auto-download a CSV backup first. Only CEO / Admin can use them.
      </div>
      <ResetLevel
        title="Level 1 — Financial data reset"
        description="Deletes all income, expenses, invoices, reports, payroll, and attendance. Keeps: users, branches, programs, exchange rates, WhatsApp recipients, and company settings."
        confirmPhrase="RESET FINANCIAL DATA"
        buttonLabel="Backup and reset financial data"
        action={wipeAllFinancialData}
        backupPrefix="pre-reset-financial"
      />
      <div style={{ height: 12 }} />
      <ResetLevel
        title="Level 2 — Deep reset"
        description="Everything from Level 1 PLUS: deletes branches, programs, exchange rates, WhatsApp recipients, and company/bank/terms settings. Keeps only your user accounts. Useful for a fresh start with all business config."
        confirmPhrase="DEEP RESET"
        buttonLabel="Backup and deep reset"
        action={deepReset}
        backupPrefix="pre-reset-deep"
      />
      <div style={{ height: 12 }} />
      <ResetLevel
        title="Level 3 — Nuclear reset"
        description="Everything from Level 2 PLUS: deletes all other user accounts, leaving ONLY your CEO account. Use only for a fresh company start with no other staff."
        confirmPhrase="NUCLEAR RESET"
        buttonLabel="Backup and nuclear reset"
        action={nuclearReset}
        backupPrefix="pre-reset-nuclear"
      />
    </div>
  );
}

function ResetLevel({ title, description, confirmPhrase, buttonLabel, action, backupPrefix }: {
  title: string; description: string; confirmPhrase: string; buttonLabel: string;
  action: () => Promise<{ ok: boolean; error?: string }>; backupPrefix: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function doIt() {
    setBusy(true); setMsg("Backing up data…");
    try {
      const all = await collectAllData();
      downloadAllAsCsv(all, backupPrefix);
      await new Promise((r) => setTimeout(r, 800));
      setMsg("Deleting data…");
      const res = await action();
      if (!res.ok) throw new Error(res.error);
      setMsg(`✓ ${title} complete. Backup CSVs downloaded.`);
      setConfirmText(""); setExpanded(false);
    } catch (e: any) {
      setMsg("Reset failed: " + (e.message || "unknown error"));
    }
    setBusy(false);
  }

  return (
    <div style={{ border: "1px solid var(--badbg)", borderRadius: 10, padding: 14, background: "#FEF7F6" }}>
      <div style={{ fontWeight: 700, color: "var(--bad)" }}>{title}</div>
      <div className="hint" style={{ marginTop: 4 }}>{description}</div>
      {!expanded ? (
        <div className="btnrow"><button className="btn sm bad" onClick={() => setExpanded(true)}>I understand — show reset controls</button></div>
      ) : (
        <>
          <div className="frow" style={{ marginTop: 10 }}>
            <Field label={`Type "${confirmPhrase}" to enable the button`}>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={confirmPhrase} />
            </Field>
          </div>
          {msg && <div className={"banner " + (msg.startsWith("✓") ? "ok" : msg.startsWith("Reset failed") ? "bad" : "warn")}>{msg}</div>}
          <div className="btnrow">
            <button className="btn bad" disabled={busy || confirmText !== confirmPhrase} onClick={doIt}>
              {busy ? "Working…" : buttonLabel}
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => { setExpanded(false); setConfirmText(""); setMsg(""); }}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
