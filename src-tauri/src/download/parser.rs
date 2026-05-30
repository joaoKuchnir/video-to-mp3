//! Parses yt-dlp stdout lines into structured progress events.
//!
//! Pure function — no I/O, no shared state. Trivially unit-testable
//! (Etapa 14). Regex objects are compiled once at program start via
//! `once_cell::Lazy` so the hot loop doesn't recompile them per line.

use once_cell::sync::Lazy;
use regex::Regex;

// Compiled once at first access, reused forever. `expect` is safe because the
// patterns are literals — a panic here means a typo, caught by `cargo test`.
static PCT_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\[download\]\s+([0-9.]+)%").expect("PCT_RE pattern"));
static SPEED_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"at\s+([0-9.]+\s*[KMG]?i?B/s)").expect("SPEED_RE pattern"));
static ETA_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"ETA\s+([0-9:]+)").expect("ETA_RE pattern"));

/// Structured slice of one yt-dlp stdout line, when relevant.
#[derive(Debug, PartialEq)]
pub enum YtDlpLine {
    /// `before_dl:TITLE:%(title)s` print directive.
    Title(String),
    /// `after_move:FINALPATH:%(filepath)s` print directive.
    FinalPath(String),
    /// Download percent (0-100) plus optional speed / ETA.
    Progress {
        percent: f64,
        speed: String,
        eta: String,
    },
    /// Post-download phase: muxing / extracting audio.
    Converting,
    /// Nothing we care about.
    Other,
}

/// Inspect one trimmed line. Cheap on the happy path (string contains first;
/// regex only runs when no faster check matched).
pub fn parse_line(line: &str) -> YtDlpLine {
    if let Some(t) = line.strip_prefix("TITLE:") {
        return YtDlpLine::Title(t.to_string());
    }
    if let Some(p) = line.strip_prefix("FINALPATH:") {
        return YtDlpLine::FinalPath(p.to_string());
    }
    if line.contains("[ExtractAudio]")
        || line.contains("[ffmpeg]")
        || line.contains("Destination:")
        || line.contains("Deleting original")
    {
        return YtDlpLine::Converting;
    }

    if let Some(c) = PCT_RE.captures(line) {
        let percent: f64 = c[1].parse().unwrap_or(0.0);
        let speed = SPEED_RE
            .captures(line)
            .map(|c| c[1].to_string())
            .unwrap_or_default();
        let eta = ETA_RE
            .captures(line)
            .map(|c| c[1].to_string())
            .unwrap_or_default();
        return YtDlpLine::Progress {
            percent,
            speed,
            eta,
        };
    }

    YtDlpLine::Other
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_title_directive() {
        assert_eq!(
            parse_line("TITLE:My Video"),
            YtDlpLine::Title("My Video".into())
        );
    }

    #[test]
    fn recognises_finalpath_directive() {
        assert_eq!(
            parse_line("FINALPATH:/Users/me/Music/song.mp3"),
            YtDlpLine::FinalPath("/Users/me/Music/song.mp3".into())
        );
    }

    #[test]
    fn detects_conversion_markers() {
        let markers = [
            "[ExtractAudio] Destination: /tmp/x.mp3",
            "[ffmpeg] Merging formats into x.mkv",
            "Destination: /tmp/x.webm",
            "Deleting original file /tmp/x.webm",
        ];
        for line in markers {
            assert_eq!(parse_line(line), YtDlpLine::Converting, "line: {line}");
        }
    }

    #[test]
    fn parses_full_progress_line() {
        let line = "[download]  42.5% of    3.21MiB at 1.20MiB/s ETA 00:13";
        match parse_line(line) {
            YtDlpLine::Progress {
                percent,
                speed,
                eta,
            } => {
                assert!((percent - 42.5).abs() < f64::EPSILON);
                assert_eq!(speed, "1.20MiB/s");
                assert_eq!(eta, "00:13");
            }
            other => panic!("expected Progress, got {other:?}"),
        }
    }

    #[test]
    fn parses_progress_without_speed_or_eta() {
        let line = "[download]   0.1%";
        match parse_line(line) {
            YtDlpLine::Progress {
                percent,
                speed,
                eta,
            } => {
                assert!((percent - 0.1).abs() < f64::EPSILON);
                assert!(speed.is_empty());
                assert!(eta.is_empty());
            }
            other => panic!("expected Progress, got {other:?}"),
        }
    }

    #[test]
    fn ignores_unrelated_lines() {
        assert_eq!(parse_line(""), YtDlpLine::Other);
        assert_eq!(parse_line("[info] Some unrelated log"), YtDlpLine::Other);
        assert_eq!(parse_line("[debug] foo=bar"), YtDlpLine::Other);
    }

    #[test]
    fn conversion_marker_wins_over_progress_substring() {
        // A line that includes both a conversion marker and looks like
        // progress: conversion takes precedence (declared first).
        let line = "[ExtractAudio] Destination: /tmp/x.mp3 [download]  100%";
        assert_eq!(parse_line(line), YtDlpLine::Converting);
    }
}
