//! Job registry + parallelism cap.
//!
//! Holds the Tauri AppHandle (for event emission), a tokio Semaphore that
//! gates concurrent downloads, and a map of in-flight job handles for cancel.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter};
use tokio::sync::Semaphore;

use super::events::{ProgressEvent, PROGRESS_CHANNEL};

const MAX_PARALLEL_DOWNLOADS: usize = 3;

#[derive(Clone)]
pub struct Job {
    pub handle: Arc<Mutex<Option<JoinHandle<()>>>>,
}

pub struct DownloadManager {
    pub app: AppHandle,
    pub sem: Arc<Semaphore>,
    pub jobs: Mutex<HashMap<String, Job>>,
}

impl DownloadManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            sem: Arc::new(Semaphore::new(MAX_PARALLEL_DOWNLOADS)),
            jobs: Mutex::new(HashMap::new()),
        }
    }

    /// Push a progress event to the frontend. Silent on send failure (the
    /// listener might be torn down during shutdown — not worth crashing for).
    pub fn emit(&self, ev: ProgressEvent) {
        let _ = self.app.emit(PROGRESS_CHANNEL, ev);
    }
}
