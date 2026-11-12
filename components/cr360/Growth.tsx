"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Dict } from "@/lib/cr360/i18n";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Vientiane" }).format(new Date());
function useCall(t: Dict) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const run = async (body: unknown) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/cr360/crm/growth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ tone: "warn", text: j.reasonCode === "not_enabled" ? t.growthNotEnabled : (t as Record<string, string>)[`err_${j.reasonCode ?? "server_error"}`] ?? t.err_server_error }); return false; }
      setMsg({ tone: "ok", text: t.saved }); router.refresh(); return true;
    } catch { setMsg({ tone: "warn", text: t.err_server_error }); return false; } finally { setBusy(false); }
  };
  return { busy, msg, run, Msg: () => <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div> };
}

export function CampaignForm({ branches, allowAll, t }: { branches: { id: string; name: string }[]; allowAll: boolean; t: Dict }) {
  const { busy, run, Msg } = useCall(t);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form); const s = (k: string) => String(f.get(k) ?? "").trim();
    if (await run({ action: "campaign", name: s("name"), channel: s("channel"), branchId: s("branch") || null, from: s("from"), to: s("to"), budget: Number(s("budget") || 0), spent: Number(s("spent") || 0) })) form.reset();
  }
  const d = today();
  return (
    <form className="cr-form" onSubmit={submit}>
      <div className="cr-row">
        <div className="cr-field"><label htmlFor="cp-n">{t.campaignName}</label><input id="cp-n" name="name" required minLength={2} maxLength={120} /></div>
        <div className="cr-field"><label htmlFor="cp-c">{t.channel}</label><select id="cp-c" name="channel">{["Facebook", "TikTok", "Flyer", "Event", "School visit", "Referral", "Other"].map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="cr-field"><label htmlFor="cp-b">{t.branch}</label><select id="cp-b" name="branch">{allowAll && <option value="">{t.allBranches}</option>}{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      </div>
      <div className="cr-row">
        <div className="cr-field"><label htmlFor="cp-f">{t.fromDate}</label><input id="cp-f" name="from" type="date" defaultValue={d} required /></div>
        <div className="cr-field"><label htmlFor="cp-t">{t.toDate}</label><input id="cp-t" name="to" type="date" defaultValue={d} required /></div>
        <div className="cr-field"><label htmlFor="cp-bu">{t.budgetLak}</label><input id="cp-bu" name="budget" type="number" min="0" step="1000" /></div>
        <div className="cr-field"><label htmlFor="cp-s">{t.spentLak}</label><input id="cp-s" name="spent" type="number" min="0" step="1000" /></div>
      </div>
      <button className="cr-btn" type="submit" disabled={busy}>{t.saveCampaign}</button>
      <Msg />
    </form>
  );
}

export function AttributeForm({ leads, campaigns, t }: { leads: { id: string; label: string }[]; campaigns: { id: string; name: string }[]; t: Dict }) {
  const { busy, run, Msg } = useCall(t);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form); const s = (k: string) => String(f.get(k) ?? "").trim();
    if (await run({ action: "attribute", leadId: s("lead"), campaignId: s("campaign") || undefined, referrer: s("referrer") || undefined })) form.reset();
  }
  return (
    <form className="cr-form" onSubmit={submit}>
      <div className="cr-field"><label htmlFor="at-l">{t.lead}</label><select id="at-l" name="lead" required>{leads.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></div>
      <div className="cr-row">
        <div className="cr-field"><label htmlFor="at-c">{t.campaign}</label><select id="at-c" name="campaign"><option value="">—</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="cr-field"><label htmlFor="at-r">{t.referrerCode}</label><input id="at-r" name="referrer" maxLength={80} placeholder="CR-0123" /></div>
      </div>
      <button className="cr-btn ghost" type="submit" disabled={busy || leads.length === 0}>{t.saveAttribution}</button>
      <Msg />
    </form>
  );
}

export interface RewardLead { leadId: string; leadName: string; referrer: string; status: string | null }
export function RewardList({ rows, t }: { rows: RewardLead[]; t: Dict }) {
  const { busy, run, Msg } = useCall(t);
  if (rows.length === 0) return <p className="cr-muted">{t.noRewardsDue}</p>;
  const small = { minHeight: 36, padding: "0 10px", fontSize: 13 } as const;
  return (
    <>
      <ul className="cr-list">{rows.map((r) => (
        <li key={r.leadId}>
          <span><b>{r.leadName}</b><br /><span className="cr-muted">{t.referredBy} {r.referrer}{r.status ? ` · ${t[`rw_${r.status as "approved"}`]}` : ""}</span></span>
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {!r.status && <button type="button" className="cr-btn teal" style={small} disabled={busy} onClick={() => { const x = window.prompt(t.rewardPrompt) ?? ""; if (x.trim().length >= 2) void run({ action: "approve", leadId: r.leadId, text: x }); }}>{t.approveReward}</button>}
            {r.status === "approved" && <button type="button" className="cr-btn teal" style={small} disabled={busy} onClick={() => run({ action: "give", leadId: r.leadId })}>{t.markGiven}</button>}
            {(r.status === null || r.status === "approved") && <button type="button" className="cr-btn ghost" style={small} disabled={busy} onClick={() => { const x = window.prompt(t.rejectReasonPrompt) ?? ""; if (x.trim().length >= 3) void run({ action: "decline", leadId: r.leadId, text: x }); }}>{t.decline}</button>}
          </span>
        </li>
      ))}</ul>
      <Msg />
    </>
  );
}
