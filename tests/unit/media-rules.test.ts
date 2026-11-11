import { describe, expect, it } from "vitest";
import { checkVideo, fitWithin, mediaPath } from "@/lib/cr360/media-rules";

describe("class media rules", () => {
  it("resizes photos to at most 1600 px on the long side, never upscales", () => {
    expect(fitWithin(4032, 3024)).toEqual({ w: 1600, h: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ w: 1200, h: 1600 });
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 });
  });
  it("accepts short MP4 videos only", () => {
    expect(checkVideo({ type: "video/mp4", size: 20e6, duration: 45 })).toEqual({ ok: true });
    expect(checkVideo({ type: "video/quicktime", size: 1e6, duration: 5 })).toEqual({ ok: false, code: "media_type" });
    expect(checkVideo({ type: "video/mp4", size: 60 * 1024 * 1024, duration: 30 })).toEqual({ ok: false, code: "media_too_big" });
    expect(checkVideo({ type: "video/mp4", size: 1e6, duration: 61 })).toEqual({ ok: false, code: "media_too_long" });
  });
  it("builds the storage path the database expects", () => {
    expect(mediaPath("b", "c", "2026-11-11", "u", "jpg")).toBe("b/c/2026-11-11/u.jpg");
  });
});
