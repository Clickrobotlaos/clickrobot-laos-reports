"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dict } from "@/lib/cr360/i18n";
import type { MarkStatus, RosterEntry } from "@/lib/cr360/rollcall";

/** Large, touch-friendly Present / Absent toggles. The server decides; the list refreshes after each mark. */
export function RollCall({ classId, entries, t }: { classId: string; entries: RosterEntry[]; t: Dict }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function mark(packageId: string, status: MarkStatus) {
    setBusy(packageId); setMsg(null);
    try {
      const res = await fetch("/api/cr360/attendance/mark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId, packageId, status }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setMsg((t as Record<string, string>)[`err_${j.reasonCode}`] ?? t.err_server_error);
      router.refresh();
    } catch { setMsg(t.err_server_error); } finally { setBusy(null); }
  }

  if (entries.length === 0) return <p className="cr-muted">{t.noStudentsBooked}</p>;
  return (
    <div>
      <p className="cr-muted">{t.rollCallNote}</p>
      <ul className="cr-list">{entries.map((e) => (
        <li key={e.packageId} style={{ alignItems: "center" }}>
          <span>
            <b>{e.name}</b>{e.kind === "makeup" && <span className="cr-badge" style={{ marginLeft: 6 }}>{t.makeup}</span>}
            <br /><span className="cr-muted">{t.sessionsLeft}: {e.remaining}</span>
            {e.markedElsewhere && <><br /><span className="cr-badge">{t.markedElsewhereNote}</span></>}
            {e.recordedWithoutClass && <><br /><span className="cr-badge">{t.recordedInRecords}</span></>}
          </span>
          <span className="cr-seg" role="group" aria-label={`${t.rollCall}: ${e.name}`}>
              {(["Present", "Absent"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={e.status === s}
                  disabled={busy === e.packageId || (s === "Present" && e.status !== "Present" && e.remaining <= 0)}
                  title={s === "Present" && e.status !== "Present" && e.remaining <= 0 ? t.err_no_balance : undefined}
                  style={{ minHeight: 44, minWidth: 88, padding: "0 12px" }}
                  onClick={() => e.status !== s && mark(e.packageId, s)}>
                  {s === "Present" ? t.present : t.absent}
                </button>
              ))}
          </span>
        </li>
      ))}</ul>
      <div aria-live="polite">{msg && <div className="cr-banner warn">{msg}</div>}</div>
    </div>
  );
}
