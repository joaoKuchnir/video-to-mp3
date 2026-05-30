//! Spawns yt-dlp, reads its stdout, translates lines into progress events.
//!
//! Pure orchestration here — parsing lives in `parser.rs`, paths in
//! `paths.rs`, errors in `errors.rs`. This file just glues them.

use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tracing::{debug, error, info, instrument, warn};

use super::errors::friendly_error;
use super::events::ProgressEvent;
use super::manager::DownloadManager;
use super::parser::{parse_line, YtDlpLine};
use super::paths::{bin_dir, deno_path, normalize_emitted_path, output_template};

/// Quality preset → ffmpeg mp3 bitrate.
fn bitrate_for(quality: &str) -> &'static str {
    match quality {
        "192" => "192K",
        _ => "320K",
    }
}

/// Reserve the top 5% of the progress bar for the conversion phase.
const DOWNLOAD_SCALE: f64 = 0.95;
const CONVERTING_PERCENT: f64 = 97.0;
const STDERR_TAIL_CAP: usize = 4000;

#[instrument(skip(mgr), fields(job_id = %id, quality = %quality))]
pub async fn run_download(
    mgr: &DownloadManager,
    id: &str,
    url: &str,
    quality: &str,
    out_dir: &str,
) {
    info!(url, out_dir, "starting download");
    let bitrate = bitrate_for(quality);
    let out_tmpl = output_template(out_dir);

    let shell = mgr.app.shell();
    let sidecar = match shell.sidecar("yt-dlp") {
        Ok(c) => c,
        Err(e) => {
            error!(%e, "yt-dlp sidecar missing");
            mgr.emit(ProgressEvent::Failed {
                id: id.to_string(),
                reason: format!("yt-dlp não encontrado: {e}"),
            });
            return;
        }
    };

    let ffmpeg_dir = bin_dir();
    let deno = ffmpeg_dir.as_deref().and_then(deno_path);

    let mut cmd = sidecar.args([
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "--postprocessor-args",
        &format!("ffmpeg:-b:a {bitrate}"),
        "--no-playlist",
        "--newline",
        "--progress",
        "-o",
        &out_tmpl,
        "--print",
        "after_move:FINALPATH:%(filepath)s",
        "--print",
        "before_dl:TITLE:%(title)s",
    ]);

    if let Some(dir) = &ffmpeg_dir {
        cmd = cmd.args(["--ffmpeg-location", &dir.to_string_lossy()]);
    }
    if let Some(d) = &deno {
        cmd = cmd.args(["--extractor-args", "youtube:player_client=default"]);
        cmd = cmd.args(["--js-runtimes", &format!("deno:{d}")]);
    }

    let cmd = cmd.arg(url);

    let (mut rx, _child) = match cmd.spawn() {
        Ok(pair) => pair,
        Err(e) => {
            error!(%e, "failed to spawn yt-dlp");
            mgr.emit(ProgressEvent::Failed {
                id: id.to_string(),
                reason: format!("Falha ao iniciar: {e}"),
            });
            return;
        }
    };

    let mut final_path: Option<String> = None;
    let mut stderr_tail = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                let line = String::from_utf8_lossy(&bytes);
                handle_stdout_line(mgr, id, line.trim(), &mut final_path);
            }
            CommandEvent::Stderr(bytes) => {
                let line = String::from_utf8_lossy(&bytes);
                stderr_tail.push_str(&line);
                if stderr_tail.len() > STDERR_TAIL_CAP {
                    let cut = stderr_tail.len() - STDERR_TAIL_CAP;
                    stderr_tail = stderr_tail.split_off(cut);
                }
            }
            CommandEvent::Terminated(payload) => {
                if payload.code == Some(0) {
                    info!(path = ?final_path, "download finished");
                    mgr.emit(ProgressEvent::Done {
                        id: id.to_string(),
                        path: final_path.clone().unwrap_or_default(),
                    });
                } else {
                    warn!(code = ?payload.code, "yt-dlp exited non-zero");
                    debug!(stderr_tail = %stderr_tail, "yt-dlp stderr tail");
                    mgr.emit(ProgressEvent::Failed {
                        id: id.to_string(),
                        reason: friendly_error(&stderr_tail),
                    });
                }
                return;
            }
            CommandEvent::Error(e) => {
                error!(%e, "command event error");
                mgr.emit(ProgressEvent::Failed {
                    id: id.to_string(),
                    reason: friendly_error(&e),
                });
                return;
            }
            _ => {}
        }
    }
}

fn handle_stdout_line(
    mgr: &DownloadManager,
    id: &str,
    line: &str,
    final_path: &mut Option<String>,
) {
    match parse_line(line) {
        YtDlpLine::Title(title) => mgr.emit(ProgressEvent::Meta {
            id: id.to_string(),
            title,
        }),
        YtDlpLine::FinalPath(p) => {
            *final_path = Some(normalize_emitted_path(&p));
        }
        YtDlpLine::Converting => mgr.emit(ProgressEvent::Progress {
            id: id.to_string(),
            percent: CONVERTING_PERCENT,
            speed: String::new(),
            eta: String::new(),
            stage: "Convertendo".into(),
        }),
        YtDlpLine::Progress {
            percent,
            speed,
            eta,
        } => {
            // Cap download at 95 — leave headroom for ffmpeg conversion.
            let scaled = (percent * DOWNLOAD_SCALE).min(95.0);
            mgr.emit(ProgressEvent::Progress {
                id: id.to_string(),
                percent: scaled,
                speed,
                eta,
                stage: "Baixando".into(),
            });
        }
        YtDlpLine::Other => {}
    }
}
