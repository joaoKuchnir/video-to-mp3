// Anti-Corruption Layer (DDD).
//
// All conversation with the Tauri runtime lives here. UI / hooks / components
// import from this module and never touch `@tauri-apps/*` directly.
//
// Why: if we swap IPC for a Worker, a WebSocket, or a mocked backend in tests,
// only this file changes. Equivalent to a Laravel Repository — controllers
// don't call Eloquent, they call the repository.
//
// SOLID:
//  - DIP: callers depend on this abstraction, not on the concrete transport.
//  - OCP: a new backend channel = a new implementation of these signatures.
//  - SRP: one module, one responsibility (talk to the host).

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import type { ProgressEvent, Quality, StartArgs } from "../types/download";

/**
 * Payload accepted by Rust `start_download` / `retry_download`.
 * Re-exported as `StartArgs` from ts-rs codegen. Local alias kept for the
 * public API (less Rust-y name).
 */
export type StartDownloadArgs = Omit<StartArgs, "quality"> & { quality: Quality };

/** Event channel name (kept in sync with `emit("download-progress", …)` in Rust). */
const PROGRESS_CHANNEL = "download-progress";

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

/** Resolve the user's default download directory (`~/Music/Video-MP3` on most systems). */
export function getDefaultDownloadDir(): Promise<string> {
  return invoke<string>("default_download_dir");
}

/** Enqueue a new download. Resolves once Rust accepted the request (not on finish). */
export function startDownload(args: StartDownloadArgs): Promise<void> {
  return invoke<void>("start_download", { args });
}

/** Retry a previously-failed download. Backend treats this the same as start. */
export function retryDownload(args: StartDownloadArgs): Promise<void> {
  return invoke<void>("retry_download", { args });
}

/** Cancel an in-flight or queued download. Idempotent. */
export function cancelDownload(id: string): Promise<void> {
  return invoke<void>("cancel_download", { id });
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

/**
 * Subscribe to progress events. Returns an `unlisten` function — call it on
 * unmount to avoid leaks (Tauri listeners are global).
 */
export async function onProgress(handler: (event: ProgressEvent) => void): Promise<UnlistenFn> {
  return listen<ProgressEvent>(PROGRESS_CHANNEL, (e) => handler(e.payload));
}

/* ------------------------------------------------------------------ */
/* Filesystem dialogs                                                  */
/* ------------------------------------------------------------------ */

/** Open the native folder picker. Returns the chosen path or null if cancelled. */
export async function pickFolder(defaultPath?: string): Promise<string | null> {
  const result = await openDialog({
    directory: true,
    defaultPath: defaultPath || undefined,
  });
  return typeof result === "string" ? result : null;
}

/**
 * Reveal a file in the OS file manager, with a graceful fallback to opening
 * the parent folder. Windows in particular can reject `revealItemInDir` on
 * some path shapes (UNC, restricted dirs).
 */
export async function revealFile(path: string): Promise<void> {
  try {
    await revealItemInDir(path);
  } catch (err) {
    console.warn("revealItemInDir failed, opening parent dir:", err);
    const sep = path.includes("\\") ? "\\" : "/";
    const parent = path.substring(0, path.lastIndexOf(sep));
    await openPath(parent);
  }
}

/* ------------------------------------------------------------------ */
/* OS notifications                                                    */
/* ------------------------------------------------------------------ */

/** Ask the OS for notification permission, returning the final granted state. */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    return (await requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Fire-and-forget OS notification. Safe to call without checking permission first. */
export function notifyOs(title: string, body: string): void {
  sendNotification({ title, body });
}
