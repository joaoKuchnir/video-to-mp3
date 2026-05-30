//! Thin `#[tauri::command]` layer.
//!
//! Each command delegates immediately — keeps the IPC surface minimal and
//! the testable logic in `runner` / `parser` / `errors` (pure modules).

use std::sync::{Arc, Mutex};

use serde::Deserialize;
use tauri::State;
use tracing::{debug, info};
use ts_rs::TS;

use super::app_error::AppError;
use super::events::ProgressEvent;
use super::manager::{DownloadManager, Job};
use super::runner::run_download;

#[derive(Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
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
) -> Result<(), AppError> {
    let manager = manager.inner().clone();
    spawn_job(manager, args)?;
    Ok(())
}

#[tauri::command]
pub async fn retry_download(
    args: StartArgs,
    manager: State<'_, Arc<DownloadManager>>,
) -> Result<(), AppError> {
    let manager = manager.inner().clone();
    spawn_job(manager, args)?;
    Ok(())
}

#[tauri::command]
pub fn cancel_download(
    id: String,
    manager: State<'_, Arc<DownloadManager>>,
) -> Result<(), AppError> {
    info!(%id, "cancel requested");
    // `?` on the lock — poisoned mutex becomes `AppError::LockPoisoned`
    // instead of panicking the whole runtime.
    let job = manager.jobs.lock()?.remove(&id);
    if let Some(job) = job {
        if let Some(h) = job.handle.lock()?.take() {
            h.abort();
        }
        manager.emit(ProgressEvent::Cancelled { id });
    } else {
        debug!("cancel target not in registry (already finished?)");
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
pub fn set_max_parallel(_n: usize) -> Result<(), AppError> {
    // Semaphore resizing is non-trivial; placeholder for future use.
    Ok(())
}

fn spawn_job(manager: Arc<DownloadManager>, args: StartArgs) -> Result<(), AppError> {
    let id = args.id.clone();
    let sem = manager.sem.clone();
    let mgr = manager.clone();

    let handle = tauri::async_runtime::spawn(async move {
        let _permit = match sem.acquire().await {
            Ok(p) => p,
            Err(_) => return,
        };
        run_download(&mgr, &args.id, &args.url, &args.quality, &args.out_dir).await;
        if let Ok(mut jobs) = mgr.jobs.lock() {
            jobs.remove(&args.id);
        }
    });

    manager.jobs.lock()?.insert(
        id,
        Job {
            handle: Arc::new(Mutex::new(Some(handle))),
        },
    );
    Ok(())
}
