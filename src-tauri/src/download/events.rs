//! Progress events emitted by the backend over Tauri's event bus.
//!
//! Single source of truth: this enum + ts-rs codegen produce
//! `src/types/generated/ProgressEvent.ts`. Frontend imports from there.

use serde::Serialize;
use ts_rs::TS;

/// Tagged union the frontend consumes via `onProgress(handler)`.
#[derive(Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
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

/// Channel name shared with the frontend.
pub const PROGRESS_CHANNEL: &str = "download-progress";
