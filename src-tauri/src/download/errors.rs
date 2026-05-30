//! Translates raw yt-dlp / ffmpeg error tails into Portuguese user-facing
//! messages.
//!
//! Strategy Pattern (data-driven). The classification cascade is a `static`
//! table of `(needles, message)` pairs evaluated in declared order. Adding a
//! new case = appending a row to `MATCHERS` — no branch to edit, no test to
//! refactor.
//!
//! Same idea as `statusStrategies.tsx` on the frontend: data over code,
//! Open/Closed Principle, one source of truth.

/// One classification rule. `needles` are case-insensitive substrings; if any
/// matches the lowercased input, `message` is returned.
struct ErrorMatcher {
    needles: &'static [&'static str],
    message: &'static str,
}

/// Evaluated top-to-bottom. Order matters: more specific cases first.
static MATCHERS: &[ErrorMatcher] = &[
    ErrorMatcher {
        needles: &["private video"],
        message: "Vídeo privado",
    },
    ErrorMatcher {
        needles: &["video unavailable", "removed"],
        message: "Vídeo indisponível ou removido",
    },
    ErrorMatcher {
        needles: &["sign in", "age"],
        message: "Vídeo requer login / restrição de idade",
    },
    ErrorMatcher {
        needles: &["unsupported url", "is not a valid url"],
        message: "Link inválido ou site não suportado",
    },
    ErrorMatcher {
        needles: &["network", "getaddrinfo", "timed out"],
        message: "Erro de rede. Verifique a conexão",
    },
];

const UNKNOWN: &str = "Falha desconhecida";
const TAIL_CAP: usize = 160;

/// Map a raw stderr blob into a friendly Portuguese reason.
pub fn friendly_error(raw: &str) -> String {
    if raw.trim().is_empty() {
        return UNKNOWN.into();
    }

    let lc = raw.to_lowercase();
    if let Some(m) = MATCHERS
        .iter()
        .find(|m| m.needles.iter().any(|n| lc.contains(n)))
    {
        return m.message.into();
    }

    // Fallback: last non-empty line, capped.
    raw.lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or(UNKNOWN)
        .trim()
        .chars()
        .take(TAIL_CAP)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_returns_unknown() {
        assert_eq!(friendly_error(""), UNKNOWN);
        assert_eq!(friendly_error("   \n  "), UNKNOWN);
    }

    #[test]
    fn matches_private_video() {
        let raw = "ERROR: [youtube] xyz: Private video. Sign in if you've been granted access.";
        assert_eq!(friendly_error(raw), "Vídeo privado");
    }

    #[test]
    fn matches_unavailable_or_removed() {
        assert_eq!(
            friendly_error("ERROR: Video unavailable"),
            "Vídeo indisponível ou removido"
        );
        assert_eq!(
            friendly_error("This video has been removed by the uploader."),
            "Vídeo indisponível ou removido"
        );
    }

    #[test]
    fn matches_age_restriction() {
        assert_eq!(
            friendly_error("ERROR: Sign in to confirm your age"),
            "Vídeo requer login / restrição de idade"
        );
    }

    #[test]
    fn matches_unsupported_url() {
        assert_eq!(
            friendly_error("ERROR: Unsupported URL: https://weird.tv/abc"),
            "Link inválido ou site não suportado"
        );
    }

    #[test]
    fn matches_network_errors() {
        for line in [
            "ERROR: Network is unreachable",
            "getaddrinfo failed",
            "ERROR: Read timed out",
        ] {
            assert_eq!(
                friendly_error(line),
                "Erro de rede. Verifique a conexão",
                "line: {line}"
            );
        }
    }

    #[test]
    fn fallback_returns_last_non_empty_line_trimmed() {
        let raw = "first line\n  middle  \n\n   ";
        assert_eq!(friendly_error(raw), "middle");
    }

    #[test]
    fn fallback_is_capped_at_160_chars() {
        let raw = format!("zz {}", "x".repeat(500));
        let result = friendly_error(&raw);
        assert_eq!(result.chars().count(), TAIL_CAP);
    }

    #[test]
    fn matchers_evaluated_in_declared_order() {
        // "private video" + "removed" both match — `private video` wins
        // because it appears first in MATCHERS.
        let raw = "ERROR: Private video. The video was also removed.";
        assert_eq!(friendly_error(raw), "Vídeo privado");
    }
}
