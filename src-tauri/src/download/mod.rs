//! Download feature root. See sibling files for responsibilities.
//!
//! Public surface:
//!  - `DownloadManager`: managed Tauri state.
//!  - All `#[tauri::command]`s: re-exported for `invoke_handler!`.

pub mod app_error;
pub mod commands;
pub mod errors;
pub mod events;
pub mod manager;
pub mod parser;
pub mod paths;
pub mod runner;

pub use manager::DownloadManager;
