use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::sync::Semaphore;

/// Quality preset -> ffmpeg mp3 bitrate.
fn bitrate_for(quality: &str) -> &'static str {
    match quality {
        "192" => "192K",
        _ => "320K",
    }
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProgressEvent {
    /// Metadata resolved (title known).
    #[serde(rename_all = "camelCase")]
    Meta { id: String, title: String },
    /// Download/convert progress, 0-100.
    #[serde(rename_all = "camelCase")]
    Progress {
        id: String,
        percent: f64,
        speed: String,
        eta: String,
        stage: String,
    },
    /// Finished OK. `path` is the final mp3.
    #[serde(rename_all = "camelCase")]
    Done { id: String, path: String },
    /// Failed with a human-readable reason.
    #[serde(rename_all = "camelCase")]
    Failed { id: String, reason: String },
    /// User-cancelled.
    #[serde(rename_all = "camelCase")]
    Cancelled { id: String },
}

#[derive(Clone)]
struct Job {
    handle: Arc<Mutex<Option<JoinHandle<()>>>>,
}

pub struct DownloadManager {
    app: AppHandle,
    sem: Arc<Semaphore>,
    jobs: Mutex<HashMap<String, Job>>,
}

impl DownloadManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            sem: Arc::new(Semaphore::new(3)),
            jobs: Mutex::new(HashMap::new()),
        }
    }

    fn emit(&self, ev: ProgressEvent) {
        let _ = self.app.emit("download-progress", ev);
    }
}

/// Map a raw yt-dlp/ffmpeg error tail into a friendly reason.
fn friendly_error(raw: &str) -> String {
    let lc = raw.to_lowercase();
    if lc.contains("private video") {
        "Vídeo privado".into()
    } else if lc.contains("video unavailable") || lc.contains("removed") {
        "Vídeo indisponível ou removido".into()
    } else if lc.contains("sign in") || lc.contains("age") {
        "Vídeo requer login / restrição de idade".into()
    } else if lc.contains("unsupported url") || lc.contains("is not a valid url") {
        "Link inválido ou site não suportado".into()
    } else if lc.contains("network") || lc.contains("getaddrinfo") || lc.contains("timed out") {
        "Erro de rede. Verifique a conexão".into()
    } else if raw.trim().is_empty() {
        "Falha desconhecida".into()
    } else {
        // last non-empty line
        raw.lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("Falha desconhecida")
            .trim()
            .chars()
            .take(160)
            .collect()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartArgs {
    pub id: String,
    pub url: String,
    pub quality: String,
    pub out_dir: String,
}

#[tauri::command]
pub async fn start_download(
    args: StartArgs,
    manager: State<'_, Arc<DownloadManager>>,
) -> Result<(), String> {
    let manager = manager.inner().clone();
    spawn_job(manager, args).await;
    Ok(())
}

#[tauri::command]
pub async fn retry_download(
    args: StartArgs,
    manager: State<'_, Arc<DownloadManager>>,
) -> Result<(), String> {
    let manager = manager.inner().clone();
    spawn_job(manager, args).await;
    Ok(())
}

async fn spawn_job(manager: Arc<DownloadManager>, args: StartArgs) {
    let id = args.id.clone();
    let sem = manager.sem.clone();
    let mgr = manager.clone();

    let handle = tauri::async_runtime::spawn(async move {
        // Wait for a free parallel slot.
        let _permit = match sem.acquire().await {
            Ok(p) => p,
            Err(_) => return,
        };
        run_download(&mgr, &args).await;
        mgr.jobs.lock().unwrap().remove(&args.id);
    });

    manager.jobs.lock().unwrap().insert(
        id,
        Job {
            handle: Arc::new(Mutex::new(Some(handle))),
        },
    );
}

async fn run_download(mgr: &DownloadManager, args: &StartArgs) {
    let bitrate = bitrate_for(&args.quality);
    // Output template: title.mp3 in chosen dir.
    let out_tmpl = format!("{}/%(title)s.%(ext)s", args.out_dir.trim_end_matches('/'));

    let shell = mgr.app.shell();
    let sidecar = match shell.sidecar("yt-dlp") {
        Ok(c) => c,
        Err(e) => {
            mgr.emit(ProgressEvent::Failed {
                id: args.id.clone(),
                reason: format!("yt-dlp não encontrado: {e}"),
            });
            return;
        }
    };

    // Directory holding sidecar binaries (ffmpeg + deno live next to the app exe).
    let bin_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    let ffmpeg_dir = bin_dir.clone();

    // yt-dlp needs a JS runtime for YouTube. Point it at our embedded deno sidecar.
    // Tauri strips the target-triple suffix at install time, so the file is just
    // "deno" (or "deno.exe" on Windows).
    let deno_path = bin_dir.as_ref().and_then(|d| {
        ["deno", "deno.exe"]
            .iter()
            .map(|name| d.join(name))
            .find(|p| p.exists())
            .map(|p| p.to_string_lossy().to_string())
    });

    let mut cmd = sidecar
        .args([
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
    if let Some(deno) = &deno_path {
        cmd = cmd.args(["--extractor-args", "youtube:player_client=default"]);
        cmd = cmd.args(["--js-runtimes", &format!("deno:{deno}")]);
    }

    let cmd = cmd.arg(&args.url);

    let (mut rx, _child) = match cmd.spawn() {
        Ok(pair) => pair,
        Err(e) => {
            mgr.emit(ProgressEvent::Failed {
                id: args.id.clone(),
                reason: format!("Falha ao iniciar: {e}"),
            });
            return;
        }
    };

    let mut final_path: Option<String> = None;
    let mut stderr_tail = String::new();
    let pct_re = regex::Regex::new(r"\[download\]\s+([0-9.]+)%").unwrap();
    let speed_re = regex::Regex::new(r"at\s+([0-9.]+\s*[KMG]?i?B/s)").unwrap();
    let eta_re = regex::Regex::new(r"ETA\s+([0-9:]+)").unwrap();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                let line = String::from_utf8_lossy(&bytes);
                let line = line.trim();
                if let Some(t) = line.strip_prefix("TITLE:") {
                    mgr.emit(ProgressEvent::Meta {
                        id: args.id.clone(),
                        title: t.to_string(),
                    });
                } else if let Some(p) = line.strip_prefix("FINALPATH:") {
                    final_path = Some(p.to_string());
                } else if line.contains("[ExtractAudio]") || line.contains("Destination") {
                    mgr.emit(ProgressEvent::Progress {
                        id: args.id.clone(),
                        percent: 99.0,
                        speed: String::new(),
                        eta: String::new(),
                        stage: "Convertendo".into(),
                    });
                } else if let Some(c) = pct_re.captures(line) {
                    let percent: f64 = c[1].parse().unwrap_or(0.0);
                    let speed = speed_re
                        .captures(line)
                        .map(|c| c[1].to_string())
                        .unwrap_or_default();
                    let eta = eta_re
                        .captures(line)
                        .map(|c| c[1].to_string())
                        .unwrap_or_default();
                    mgr.emit(ProgressEvent::Progress {
                        id: args.id.clone(),
                        percent,
                        speed,
                        eta,
                        stage: "Baixando".into(),
                    });
                }
            }
            CommandEvent::Stderr(bytes) => {
                let line = String::from_utf8_lossy(&bytes);
                stderr_tail.push_str(&line);
                if stderr_tail.len() > 4000 {
                    let cut = stderr_tail.len() - 4000;
                    stderr_tail = stderr_tail.split_off(cut);
                }
            }
            CommandEvent::Terminated(payload) => {
                if payload.code == Some(0) {
                    let path = final_path.clone().unwrap_or_default();
                    mgr.emit(ProgressEvent::Done {
                        id: args.id.clone(),
                        path,
                    });
                } else {
                    mgr.emit(ProgressEvent::Failed {
                        id: args.id.clone(),
                        reason: friendly_error(&stderr_tail),
                    });
                }
                return;
            }
            CommandEvent::Error(e) => {
                mgr.emit(ProgressEvent::Failed {
                    id: args.id.clone(),
                    reason: friendly_error(&e),
                });
                return;
            }
            _ => {}
        }
    }
}

#[tauri::command]
pub fn cancel_download(id: String, manager: State<'_, Arc<DownloadManager>>) -> Result<(), String> {
    let job = manager.jobs.lock().unwrap().remove(&id);
    if let Some(job) = job {
        if let Some(h) = job.handle.lock().unwrap().take() {
            h.abort();
        }
        manager.emit(ProgressEvent::Cancelled { id });
    }
    Ok(())
}

#[tauri::command]
pub fn default_download_dir() -> String {
    dirs::audio_dir()
        .or_else(dirs::download_dir)
        .or_else(dirs::home_dir)
        .map(|p| p.join("Video-MP3").to_string_lossy().to_string())
        .unwrap_or_else(|| "Video-MP3".into())
}

#[tauri::command]
pub fn set_max_parallel(_n: usize) -> Result<(), String> {
    // Semaphore resizing is non-trivial; placeholder for future use.
    Ok(())
}
