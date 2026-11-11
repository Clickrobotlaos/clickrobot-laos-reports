"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import type { Dict } from "@/lib/cr360/i18n";
import { MEDIA_BUCKET, PHOTO_QUALITY, checkVideo, fitWithin, mediaPath } from "@/lib/cr360/media-rules";

export interface MediaItem { id: string; kind: "photo" | "video"; url: string | null; caption: string | null; status: string; tagged: string[] }

/** Shrink a camera photo on the phone (1600 px, JPEG) before upload: ~0.3 MB instead of 3–8 MB. */
async function compressPhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const { w, h } = fitWithin(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", PHOTO_QUALITY));
}
function videoDuration(file: File): Promise<number> {
  return new Promise((res) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); res(v.duration); };
    v.onerror = () => res(0);
    v.src = URL.createObjectURL(file);
  });
}

/**
 * Teacher: add class photos / short videos, tag the children in them, then share with their parents.
 * The file goes straight from the phone to the PRIVATE bucket (storage policy checks the class);
 * sharing needs photo/video consent for every tagged child (checked in the database).
 */
export function ClassMedia({ classId, branchId, date, students, items, t }: {
  classId: string; branchId: string; date: string; students: { packageId: string; name: string }[]; items: MediaItem[]; t: Dict;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const err = (code?: string) => (t as Record<string, string>)[`err_${code ?? "server_error"}`] ?? t.err_server_error;
  const nameOf = new Map(students.map((s) => [s.packageId, s.name]));

  async function call(body: unknown) {
    const res = await fetch("/api/cr360/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, code: j.reasonCode as string | undefined };
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    const file = f.get("file") as File | null;
    if (!file || file.size === 0) return;
    const tagged = f.getAll("tag").map(String);
    setBusy(true); setMsg(null);
    try {
      const isVideo = file.type.startsWith("video/");
      let blob: Blob = file; let duration: number | undefined;
      if (isVideo) {
        duration = await videoDuration(file);
        const c = checkVideo({ type: file.type, size: file.size, duration });
        if (!c.ok) { setMsg({ tone: "warn", text: err(c.code) }); return; }
      } else {
        blob = await compressPhoto(file);
      }
      const path = mediaPath(branchId, classId, date, crypto.randomUUID(), isVideo ? "mp4" : "jpg");
      const up = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: isVideo ? "video/mp4" : "image/jpeg", upsert: false });
      if (up.error) { setMsg({ tone: "warn", text: err("media_upload") }); return; }
      const r = await call({ action: "register", path, kind: isVideo ? "video" : "photo", mime: isVideo ? "video/mp4" : "image/jpeg",
        bytes: blob.size, durationS: duration ? Math.round(duration * 10) / 10 : undefined, caption: String(f.get("caption") ?? "").trim() || undefined, tagged });
      if (!r.ok) { setMsg({ tone: "warn", text: err(r.code) }); return; }
      form.reset(); setMsg({ tone: "ok", text: t.mediaUploaded }); router.refresh();
    } catch { setMsg({ tone: "warn", text: err("media_upload") }); }
    finally { setBusy(false); }
  }

  async function act(id: string, action: "share" | "unshare" | "remove") {
    let reason: string | undefined;
    if (action === "remove") { reason = window.prompt(t.removeReasonPrompt) ?? ""; if (reason.trim().length < 3) return; }
    setBusy(true); setMsg(null);
    const r = await call({ action, id, reason });
    setBusy(false);
    if (r.ok) router.refresh(); else setMsg({ tone: "warn", text: err(r.code) });
  }

  return (
    <section className="cr-card" aria-labelledby="cm-h">
      <h2 id="cm-h">📷 {t.classMedia}</h2>
      <p className="cr-muted">{t.classMediaNote}</p>
      {items.length > 0 && (
        <ul className="cr-media-grid">{items.map((m) => (
          <li key={m.id} className="cr-media-card">
            {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL; must not pass through the image optimizer/cache */}
            {m.url ? (m.kind === "video" ? <video src={m.url} controls preload="metadata" /> : <img src={m.url} alt={m.caption ?? t.classMedia} loading="lazy" />) : <div className="cr-muted">—</div>}
            <div style={{ padding: 8 }}>
              {m.caption && <div>{m.caption}</div>}
              <div className="cr-muted" style={{ fontSize: 13 }}>{m.tagged.map((p) => nameOf.get(p) ?? "—").join(", ") || t.noOneTagged}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                <span className={`cr-badge ${m.status === "shared" ? "approved" : ""}`}>{m.status === "shared" ? t.mediaShared : t.mediaPrivate}</span>
                {m.status === "private" && <button type="button" className="cr-btn teal" style={{ minHeight: 36 }} disabled={busy} onClick={() => act(m.id, "share")}>{t.shareWithParents}</button>}
                {m.status === "shared" && <button type="button" className="cr-btn ghost" style={{ minHeight: 36 }} disabled={busy} onClick={() => act(m.id, "unshare")}>{t.unshare}</button>}
                <button type="button" className="cr-btn ghost" style={{ minHeight: 36 }} disabled={busy} onClick={() => act(m.id, "remove")}>{t.removeMedia}</button>
              </div>
            </div>
          </li>
        ))}</ul>
      )}
      <form className="cr-form" onSubmit={upload} style={{ marginTop: 12 }}>
        <div className="cr-field"><label htmlFor="cm-file">{t.addPhotoVideo}</label>
          <input id="cm-file" name="file" type="file" accept="image/*,video/mp4" required /></div>
        <fieldset className="cr-field" style={{ border: 0, padding: 0 }}>
          <legend>{t.whoIsInIt}</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{students.map((s) => (
            <label key={s.packageId} style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 40 }}>
              <input type="checkbox" name="tag" value={s.packageId} style={{ width: 20, height: 20, minHeight: 0 }} /> {s.name}
            </label>
          ))}</div>
        </fieldset>
        <div className="cr-field"><label htmlFor="cm-cap">{t.caption}</label><input id="cm-cap" name="caption" maxLength={300} /></div>
        <button className="cr-btn" type="submit" disabled={busy}>{busy ? t.submitting : t.upload}</button>
      </form>
      <div aria-live="polite">{msg && <div className={`cr-banner ${msg.tone}`}>{msg.text}</div>}</div>
    </section>
  );
}
