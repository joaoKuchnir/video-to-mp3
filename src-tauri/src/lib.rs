mod downloader;

use downloader::DownloadManager;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
            downloader::start_download,
            downloader::cancel_download,
            downloader::retry_download,
            downloader::default_download_dir,
            downloader::set_max_parallel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
