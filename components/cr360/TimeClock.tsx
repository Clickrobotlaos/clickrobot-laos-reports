"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dict } from "@/lib/cr360/i18n";
import { MAX_ACCURACY_M } from "@/lib/cr360/geo";

type Phase = "idle" | "locating" | "sending";

/**
 * User-initiated, single-shot geolocation. No watchPosition, no background tracking,
 * nothing stored in localStorage. The server decides; this UI never shows a green tick
 * for an uncertain reading.
 */
export function TimeClock({ lastKind, siteEnabledHint, t }: { lastKind: "in" | "out" | null; siteEnabledHint: boolean; t: Dict }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "bad"; text: string } | null>(null);
  const next: "in" | "out" = lastKind === "in" ? "out" : "in";

  function errText(code: string) {
    return (t as Record<string, string>)[`err_${code}`] ?? t.err_server_error;
  }

  function punch() {
    setMsg(null);
    if (!("geolocation" in navigator)) { setMsg({ tone: "warn", text: t.gpsUnavailable }); return; }
    setPhase("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const acc = pos.coords.accuracy;
        setAccuracy(acc);
        setPhase("sending");
        try {
          const res = await fetch("/api/cr360/staff/clock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: next,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              reportedAccuracyM: acc,
              nonce: crypto.randomUUID(),
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (res.ok && body.status === "accepted") {
            setMsg({ tone: "ok", text: `${t.ok_clock} ${body.serverTime ? `(${t.serverTime}: ${new Date(body.serverTime).toLocaleTimeString()})` : ""}` });
            router.refresh();
          } else {
            setMsg({ tone: "warn", text: errText(body.reasonCode ?? "server_error") });
          }
        } catch {
          setMsg({ tone: "bad", text: t.err_server_error });
        } finally {
          setPhase("idle");
        }
      },
      () => { setPhase("idle"); setMsg({ tone: "warn", text: t.gpsUnavailable }); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  const label = phase === "locating" ? "GPS…" : phase === "sending" ? t.submitting : next === "in" ? t.checkIn : t.checkOut;
  return (
    <div>
      {!siteEnabledHint && <div className="cr-banner warn">{t.err_site_disabled}</div>}
      <button type="button" className={`cr-btn big ${next === "out" ? "teal" : ""}`} onClick={punch} disabled={phase !== "idle"}>{label}</button>
      <p className="cr-muted">{t.gpsAsk}</p>
      {accuracy !== null && (
        <p className="cr-muted">
          {t.gpsAccuracy}: <b style={{ color: accuracy <= MAX_ACCURACY_M ? "var(--c-ok)" : "var(--c-warn)" }}>±{accuracy.toFixed(1)} m</b> · {t.gpsThreshold}
        </p>
      )}
      <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
    </div>
  );
}
