/** Class media rules shared by the browser and the server (mirror of 0016). Pure. */
export const MEDIA_BUCKET = "cr360-class-media";
export const MAX_PHOTO_EDGE = 1600;          // px, longest side after on-device resize
export const PHOTO_QUALITY = 0.8;            // JPEG quality
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;
export const PHOTOS_PER_CLASS_DAY = 6;
export const VIDEOS_PER_CLASS_DAY = 1;
export const SIGNED_URL_SECONDS = 3600;

/** Target size keeping aspect ratio; never upscales. */
export function fitWithin(w: number, h: number, max = MAX_PHOTO_EDGE): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

export type VideoCheck = { ok: true } | { ok: false; code: "media_type" | "media_too_big" | "media_too_long" };
export function checkVideo(v: { type: string; size: number; duration: number }): VideoCheck {
  if (v.type !== "video/mp4") return { ok: false, code: "media_type" };
  if (v.size > MAX_VIDEO_BYTES) return { ok: false, code: "media_too_big" };
  if (!(v.duration > 0) || v.duration > MAX_VIDEO_SECONDS) return { ok: false, code: "media_too_long" };
  return { ok: true };
}

/** <branch>/<class>/<yyyy-mm-dd>/<uuid>.<ext> — the database checks the same shape. */
export function mediaPath(branchId: string, classId: string, date: string, id: string, ext: "jpg" | "mp4"): string {
  return `${branchId}/${classId}/${date}/${id}.${ext}`;
}
