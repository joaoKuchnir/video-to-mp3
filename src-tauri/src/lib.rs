mod download;

use std::sync::Arc;
use tauri::Manager;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use download::DownloadManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // `RUST_LOG=video_mp3=debug` to crank up; default is `info`.
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,video_mp3_lib=debug"));
    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().with_target(false).compact())
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let manager = Arc::new(DownloadManager::new(app.handle().clone()));
            app.manage(manager);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            download::commands::start_download,
            download::commands::cancel_download,
            download::commands::retry_download,
            download::commands::default_download_dir,
            download::commands::set_max_parallel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
