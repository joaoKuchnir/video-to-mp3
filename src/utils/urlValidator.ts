// Per-host URL validation for video links.
//
// Strategy pattern: each host gets a (pattern, message) entry. To support a
// new site, append to `VALIDATORS`. The first matching host wins.
//
// Returns a tagged union so the UI can render error states semantically
// instead of stringly-typed flags.

export type UrlValidation = { ok: true; host: string } | { ok: false; reason: string };

interface HostValidator {
  /** Substring that identifies the host in the URL. Case-insensitive. */
  hostMatch: string;
  /** Friendly name shown in success/error messages. */
  label: string;
  /**
   * Must extract a non-empty ID/path from the URL. If it returns null/empty
   * the URL is considered malformed for that host.
   */
  extractId: (url: URL) => string | null;
}

const VALIDATORS: readonly HostValidator[] = [
  {
    hostMatch: "youtube.com",
    label: "YouTube",
    extractId: (u) => {
      // /watch?v=ID, /shorts/ID, /live/ID, /playlist?list=ID
      const v = u.searchParams.get("v");
      if (v && v.length >= 8) return v;
      const m = u.pathname.match(/\/(shorts|live|embed)\/([\w-]{8,})/);
      if (m) return m[2];
      const list = u.searchParams.get("list");
      if (list && list.length >= 8) return list;
      return null;
    },
  },
  {
    hostMatch: "youtu.be",
    label: "YouTube",
    extractId: (u) => {
      // youtu.be/ID
      const id = u.pathname.replace(/^\//, "");
      return id.length >= 8 ? id : null;
    },
  },
  {
    hostMatch: "vimeo.com",
    label: "Vimeo",
    extractId: (u) => {
      // vimeo.com/123456789
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return /^\d{6,}$/.test(id) ? id : null;
    },
  },
  {
    hostMatch: "soundcloud.com",
    label: "SoundCloud",
    // soundcloud.com/<user>/<track>
    extractId: (u) => {
      const parts = u.pathname.split("/").filter(Boolean);
      return parts.length >= 2 ? parts.join("/") : null;
    },
  },
  // More specific subdomain first — `host.endsWith("twitch.tv")` would also
  // match this URL, so order matters.
  {
    hostMatch: "clips.twitch.tv",
    label: "Twitch",
    extractId: (u) => {
      const slug = u.pathname.replace(/^\//, "");
      return slug.length > 0 ? slug : null;
    },
  },
  {
    hostMatch: "twitch.tv",
    label: "Twitch",
    extractId: (u) => {
      // VOD: /videos/123
      const vod = u.pathname.match(/\/videos\/(\d+)/);
      if (vod) return vod[1];
      // Clip: /<channel>/clip/<slug>
      const clip = u.pathname.match(/\/clip\/([\w-]+)/);
      if (clip) return clip[1];
      // Live channel: /<channel>  (single non-empty segment)
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length === 1 && /^[\w-]+$/.test(parts[0])) return parts[0];
      return null;
    },
  },
];

/**
 * Validate a raw input string and return a typed result.
 * Empty input is treated as "ok: false" with no reason (UI shouldn't yell at
 * an empty field — that's a separate "not started typing yet" state).
 */
export function validateUrl(raw: string): UrlValidation {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: "" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "Link inválido. Cole uma URL completa começando com http(s)://" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Apenas links http(s) são aceitos." };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const validator = VALIDATORS.find((v) => host.endsWith(v.hostMatch));

  if (!validator) {
    return {
      ok: false,
      reason: `Site não suportado: ${host}. Use YouTube, Vimeo, SoundCloud ou Twitch.`,
    };
  }

  const id = validator.extractId(parsed);
  if (!id) {
    return {
      ok: false,
      reason: `Link ${validator.label} incompleto — falta o ID do vídeo/playlist.`,
    };
  }

  return { ok: true, host: validator.label };
}
