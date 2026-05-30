//! Filesystem helpers — path normalization + sidecar discovery.
//!
//! Most of this lives here so future macOS/Linux support touches one file
//! instead of grepping `cfg!(windows)` across the module.

use std::path::{Path, PathBuf};

/// Resolve the directory holding the running executable (where Tauri places
/// sidecar binaries on disk).
pub fn bin_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

/// Locate the embedded Deno sidecar. Tauri strips the target-triple suffix
/// at install time, so the on-disk name is just `deno` or `deno.exe`.
pub fn deno_path(dir: &Path) -> Option<String> {
    ["deno", "deno.exe"]
        .iter()
        .map(|name| dir.join(name))
        .find(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string())
}

/// Normalize a yt-dlp-emitted file path for OS file managers.
///
/// yt-dlp emits forward slashes even on Windows; Explorer's reveal API needs
/// backslashes. When possible we canonicalize (resolves UNC, fixes case);
/// otherwise we just swap separators on Windows.
pub fn normalize_emitted_path(raw: &str) -> String {
    if let Ok(c) = std::fs::canonicalize(raw) {
        let s = c.to_string_lossy().to_string();
        // Strip the \\?\ Windows extended-length prefix — some openers reject it.
        return s.strip_prefix(r"\\?\").map(str::to_string).unwrap_or(s);
    }
    if cfg!(windows) {
        return raw.replace('/', "\\");
    }
    raw.to_string()
}

/// Format the yt-dlp `-o` template: `<dir>/%(title)s.%(ext)s`.
pub fn output_template(out_dir: &str) -> String {
    format!("{}/%(title)s.%(ext)s", out_dir.trim_end_matches('/'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn output_template_strips_trailing_slash() {
        assert_eq!(
            output_template("/Users/me/Music"),
            "/Users/me/Music/%(title)s.%(ext)s"
        );
        assert_eq!(
            output_template("/Users/me/Music/"),
            "/Users/me/Music/%(title)s.%(ext)s"
        );
        assert_eq!(
            output_template("/Users/me/Music///"),
            "/Users/me/Music/%(title)s.%(ext)s"
        );
    }

    #[test]
    fn normalize_returns_path_for_nonexistent_file() {
        // canonicalize fails (file doesn't exist), fallback path is used.
        let result = normalize_emitted_path("/no/such/file.mp3");
        if cfg!(windows) {
            assert!(!result.contains('/') || result.contains('\\'));
        } else {
            assert_eq!(result, "/no/such/file.mp3");
        }
    }

    #[test]
    fn normalize_swaps_forward_slashes_on_windows() {
        // Only meaningful on Windows; on Unix the function preserves input.
        let input = "C:/Music/song.mp3";
        let result = normalize_emitted_path(input);
        if cfg!(windows) {
            assert!(!result.contains('/'));
        } else {
            assert_eq!(result, input);
        }
    }
}
