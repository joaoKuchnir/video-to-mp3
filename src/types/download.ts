// Domain types for the download feature.
//
// Lives outside any component so UI, hooks, and the API layer can share a
// single source of truth. UI-only types stay here; backend-contract types
// are re-exported from `generated/` (produced by Rust via ts-rs — single
// source of truth = Rust enums).

// Re-export Rust-generated contracts. Editing these requires editing the
// Rust source + running `cargo test` to regenerate.
export type { ProgressEvent } from "./generated/ProgressEvent";
export type { StartArgs } from "./generated/StartArgs";

/** Lifecycle of a single download (UI-only — backend uses event kinds). */
export type Status = "queued" | "downloading" | "done" | "failed";

/** Audio quality preset. Matches the Rust `bitrate_for` mapping. */
export type Quality = "320" | "192";

/** Which list the UI is currently showing. */
export type Tab = "active" | "done" | "failed";

/** One row in the download list (UI projection — composes title, percent, etc.). */
export interface DownloadItem {
  id: string;
  url: string;
  title: string;
  quality: Quality;
  status: Status;
  /** 0-100. While downloading capped at 95, conversion bumps to 97, done = 100. */
  percent: number;
  speed: string;
  eta: string;
  /** Human-readable phase: "Na fila", "Baixando", "Convertendo". */
  stage: string;
  path?: string;
  reason?: string;
}

/** Transient UI toast. */
export interface Toast {
  id: string;
  type: "ok" | "error";
  title: string;
  sub: string;
}
