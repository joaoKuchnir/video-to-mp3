import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks must be declared BEFORE the import that uses them — `vi.mock` is hoisted.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(),
  revealItemInDir: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";

import {
  cancelDownload,
  ensureNotificationPermission,
  getDefaultDownloadDir,
  onProgress,
  pickFolder,
  retryDownload,
  revealFile,
  startDownload,
} from "./downloads";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("commands", () => {
  it("startDownload invokes start_download with args wrapped", async () => {
    await startDownload({ id: "x", url: "u", quality: "320", outDir: "/d" });
    expect(invoke).toHaveBeenCalledWith("start_download", {
      args: { id: "x", url: "u", quality: "320", outDir: "/d" },
    });
  });

  it("retryDownload invokes retry_download", async () => {
    await retryDownload({ id: "x", url: "u", quality: "192", outDir: "/d" });
    expect(invoke).toHaveBeenCalledWith("retry_download", expect.any(Object));
  });

  it("cancelDownload invokes cancel_download with id", async () => {
    await cancelDownload("abc");
    expect(invoke).toHaveBeenCalledWith("cancel_download", { id: "abc" });
  });

  it("getDefaultDownloadDir invokes default_download_dir", async () => {
    await getDefaultDownloadDir();
    expect(invoke).toHaveBeenCalledWith("default_download_dir");
  });
});

describe("onProgress", () => {
  it("subscribes to the download-progress channel and unwraps payload", async () => {
    const handler = vi.fn();
    const unlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(unlisten);

    await onProgress(handler);

    expect(listen).toHaveBeenCalledWith("download-progress", expect.any(Function));
    // Simulate Tauri delivering an event
    const wrapper = vi.mocked(listen).mock.calls[0][1];
    wrapper({ payload: { kind: "meta", id: "x", title: "T" } } as Parameters<typeof wrapper>[0]);
    expect(handler).toHaveBeenCalledWith({ kind: "meta", id: "x", title: "T" });
  });
});

describe("pickFolder", () => {
  it("returns string when user picks a folder", async () => {
    vi.mocked(openDialog).mockResolvedValue("/chosen");
    const r = await pickFolder("/start");
    expect(r).toBe("/chosen");
    expect(openDialog).toHaveBeenCalledWith({ directory: true, defaultPath: "/start" });
  });

  it("returns null when cancelled", async () => {
    vi.mocked(openDialog).mockResolvedValue(null);
    expect(await pickFolder()).toBeNull();
  });
});

describe("revealFile", () => {
  it("uses revealItemInDir on the happy path", async () => {
    vi.mocked(revealItemInDir).mockResolvedValue(undefined);
    await revealFile("/a/b.mp3");
    expect(revealItemInDir).toHaveBeenCalledWith("/a/b.mp3");
    expect(openPath).not.toHaveBeenCalled();
  });

  it("falls back to opening the parent folder on failure", async () => {
    vi.mocked(revealItemInDir).mockRejectedValue(new Error("nope"));
    vi.mocked(openPath).mockResolvedValue(undefined);
    await revealFile("C:\\Music\\song.mp3");
    expect(openPath).toHaveBeenCalledWith("C:\\Music");
  });
});

describe("ensureNotificationPermission", () => {
  it("short-circuits when already granted", async () => {
    vi.mocked(isPermissionGranted).mockResolvedValue(true);
    expect(await ensureNotificationPermission()).toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("requests permission when not granted", async () => {
    vi.mocked(isPermissionGranted).mockResolvedValue(false);
    vi.mocked(requestPermission).mockResolvedValue("granted");
    expect(await ensureNotificationPermission()).toBe(true);
    expect(requestPermission).toHaveBeenCalled();
  });

  it("returns false on permission denied", async () => {
    vi.mocked(isPermissionGranted).mockResolvedValue(false);
    vi.mocked(requestPermission).mockResolvedValue("denied");
    expect(await ensureNotificationPermission()).toBe(false);
  });
});
