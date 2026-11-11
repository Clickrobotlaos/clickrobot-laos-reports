"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dict, DictKey } from "@/lib/cr360/i18n";

export type ConsentPurpose = "portal_media" | "ai_reports" | "notifications" | "public_marketing";
const PURPOSES: { key: ConsentPurpose; title: DictKey; body: DictKey; icon: string; separate?: boolean }[] = [
  { key: "portal_media", title: "cPortalMedia", body: "cPortalMediaBody", icon: "📷" },
  { key: "ai_reports", title: "cAiReports", body: "cAiReportsBody", icon: "✨" },
  { key: "notifications", title: "cNotifications", body: "cNotificationsBody", icon: "💬" },
  { key: "public_marketing", title: "cMarketing", body: "cMarketingBody", icon: "📣", separate: true },
];

/**
 * Parent's privacy choices for one child. Everything optional starts OFF (private by default);
 * the parent can switch each one on or off at any time. The required consent (storing the child's
 * information for lessons) is shown read-only: ending it means asking the centre to close access.
 */
export function ConsentChoices({ studentCode, state, required, enabled, t }: {
  studentCode: string; state: Partial<Record<ConsentPurpose, boolean>>; required: { version: string | null; at: string | null } | null; enabled: boolean; t: Dict;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<ConsentPurpose | null>(null);
  const [local, setLocal] = useState(state);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const errText = (code?: string) => (t as Record<string, string>)[`err_${code ?? "server_error"}`] ?? t.err_server_error;

  async function toggle(p: ConsentPurpose, granted: boolean) {
    setBusy(p); setMsg(null);
    try {
      const res = await fetch("/api/cr360/guardians/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentCode, purpose: p, granted }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ tone: "warn", text: errText(j.reasonCode) }); return; }
      setLocal((s) => ({ ...s, [p]: granted })); setMsg({ tone: "ok", text: t.saved }); router.refresh();
    } catch { setMsg({ tone: "warn", text: t.err_server_error }); }
    finally { setBusy(null); }
  }

  if (!enabled) return <p className="cr-muted">{t.consentNotEnabled}</p>;
  return (
    <div>
      <p className="cr-muted">{t.consentIntro}</p>
      {required && (
        <div className="cr-consent required">
          <span aria-hidden="true">🔒</span>
          <span><b>{t.cRequired}</b><br /><span className="cr-muted">{t.cRequiredBody}{required.version ? ` (${required.version})` : ""}</span></span>
        </div>
      )}
      <ul className="cr-consent-list">
        {PURPOSES.map((p) => {
          const on = local[p.key] === true;
          return (
            <li key={p.key} className={`cr-consent${p.separate ? " separate" : ""}`}>
              <span aria-hidden="true" className="cr-consent-icon">{p.icon}</span>
              <span style={{ flex: 1 }}>
                <b>{t[p.title]}</b>{p.separate && <span className="cr-badge" style={{ marginLeft: 6 }}>{t.cSeparate}</span>}
                <br /><span className="cr-muted">{t[p.body]}</span>
              </span>
              <button type="button" role="switch" aria-checked={on} aria-label={t[p.title]} className={`cr-switch${on ? " on" : ""}`}
                disabled={busy !== null} onClick={() => toggle(p.key, !on)}>
                <span>{on ? t.cOn : t.cOff}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
    </div>
  );
}
