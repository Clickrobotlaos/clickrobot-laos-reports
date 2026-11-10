import type { ReactNode } from "react";
import type { Dict } from "@/lib/cr360/i18n";

export function Unauthorized({ t }: { t: Dict }) {
  return (
    <div className="cr-card" role="alert">
      <h2>{t.unauthorized}</h2>
      <p className="cr-muted">{t.unauthorizedHint}</p>
    </div>
  );
}

/** Honest "not built yet" state: names the phase and the blocker. Never shows invented numbers. */
export function Planned({ t, title, phase, blockers, children }: { t: Dict; title: string; phase: string; blockers: string[]; children?: ReactNode }) {
  return (
    <div className="cr-card">
      <h2>{title} <span className="cr-badge">{t.notConnected}</span></h2>
      <p className="cr-muted">{t.plannedPhase}: <b>{phase}</b></p>
      {blockers.length > 0 && (
        <>
          <p className="cr-muted" style={{ marginBottom: 4 }}>{t.blockedBy}:</p>
          <ul className="cr-muted" style={{ marginTop: 0 }}>{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </>
      )}
      {children}
    </div>
  );
}

export function StatusBadge({ status, t }: { status: string; t: Dict }) {
  const label = (t as Record<string, string>)[status] ?? status;
  return <span className={`cr-badge ${status}`}>{label}</span>;
}
