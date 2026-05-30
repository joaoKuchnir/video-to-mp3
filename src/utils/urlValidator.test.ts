import { describe, expect, it } from "vitest";
import { validateUrl } from "./urlValidator";

describe("validateUrl", () => {
  it("empty input is not ok but has no error message", () => {
    expect(validateUrl("")).toEqual({ ok: false, reason: "" });
    expect(validateUrl("   ")).toEqual({ ok: false, reason: "" });
  });

  it("rejects malformed URLs", () => {
    expect(validateUrl("not a url")).toMatchObject({ ok: false });
    expect(validateUrl("youtube.com/watch?v=abc")).toMatchObject({ ok: false });
  });

  it("rejects non-http protocols", () => {
    expect(validateUrl("ftp://x.com/foo")).toMatchObject({
      ok: false,
      reason: expect.stringContaining("http(s)"),
    });
  });

  it("rejects unsupported hosts", () => {
    const r = validateUrl("https://example.com/video/123");
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toContain("não suportado");
  });

  describe("YouTube", () => {
    it("accepts /watch?v=ID", () => {
      expect(validateUrl("https://www.youtube.com/watch?v=3BBsF7VIQyo")).toMatchObject({
        ok: true,
        host: "YouTube",
      });
    });

    it("accepts youtu.be short links", () => {
      expect(validateUrl("https://youtu.be/3BBsF7VIQyo")).toMatchObject({
        ok: true,
        host: "YouTube",
      });
    });

    it("accepts /shorts/ID", () => {
      expect(validateUrl("https://www.youtube.com/shorts/abc12345")).toMatchObject({ ok: true });
    });

    it("rejects /watch?v= (empty ID — the original bug)", () => {
      const r = validateUrl("https://www.youtube.com/watch?v=");
      expect(r.ok).toBe(false);
      expect((r as { reason: string }).reason).toContain("incompleto");
    });

    it("rejects /watch with no v param", () => {
      expect(validateUrl("https://www.youtube.com/watch")).toMatchObject({
        ok: false,
      });
    });

    it("accepts playlist links via list= param", () => {
      expect(validateUrl("https://www.youtube.com/playlist?list=PLabcdefghij")).toMatchObject({
        ok: true,
      });
    });
  });

  describe("Vimeo", () => {
    it("accepts numeric IDs", () => {
      expect(validateUrl("https://vimeo.com/123456789")).toMatchObject({
        ok: true,
      });
    });

    it("rejects non-numeric paths", () => {
      expect(validateUrl("https://vimeo.com/about")).toMatchObject({
        ok: false,
      });
    });
  });

  describe("SoundCloud", () => {
    it("requires user/track shape", () => {
      expect(validateUrl("https://soundcloud.com/some-user/some-track")).toMatchObject({
        ok: true,
      });
      expect(validateUrl("https://soundcloud.com/some-user")).toMatchObject({
        ok: false,
      });
    });
  });

  describe("Twitch", () => {
    it("accepts VOD links", () => {
      expect(validateUrl("https://www.twitch.tv/videos/1234567890")).toMatchObject({
        ok: true,
      });
    });

    it("accepts clip links", () => {
      expect(validateUrl("https://www.twitch.tv/somechannel/clip/AbcDef-Ghij_123")).toMatchObject({
        ok: true,
      });
    });

    it("accepts live channel links", () => {
      expect(validateUrl("https://www.twitch.tv/somechannel")).toMatchObject({
        ok: true,
      });
    });

    it("accepts clips subdomain", () => {
      expect(validateUrl("https://clips.twitch.tv/AbcDef-Ghij")).toMatchObject({ ok: true });
    });
  });
});
