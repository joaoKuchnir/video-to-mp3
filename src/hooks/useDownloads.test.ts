import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the API layer (DIP pays off — we only need to swap this one module).
vi.mock("../api/downloads", () => ({
  startDownload: vi.fn(),
  cancelDownload: vi.fn(),
  retryDownload: vi.fn(),
  onProgress: vi.fn(),
}));

import * as api from "../api/downloads";
import type { ProgressEvent } from "../types/download";
import { useDownloads } from "./useDownloads";

function setup() {
  const fireToast = vi.fn();
  const notify = vi.fn();
  let captured: ((p: ProgressEvent) => void) | undefined;
  const unlisten = vi.fn();

  vi.mocked(api.onProgress).mockImplementation(async (handler) => {
    captured = handler;
    return unlisten;
  });

  const hook = renderHook(() => useDownloads({ fireToast, notify }));
  return { hook, fireToast, notify, emit: (p: ProgressEvent) => captured?.(p), unlisten };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useDownloads", () => {
  it("starts empty", () => {
    const { hook } = setup();
    expect(hook.result.current.items).toEqual([]);
    expect(hook.result.current.counts).toEqual({ active: 0, done: 0, failed: 0 });
  });

  it("subscribes once and unsubscribes on unmount", async () => {
    const { hook, unlisten } = setup();
    await waitFor(() => expect(api.onProgress).toHaveBeenCalledTimes(1));
    hook.unmount();
    // Cleanup chains through the original onProgress Promise, so unsubscribe
    // resolves a microtask later.
    await waitFor(() => expect(unlisten).toHaveBeenCalled());
  });

  it("add() inserts a queued item and calls startDownload", async () => {
    vi.mocked(api.startDownload).mockResolvedValue(undefined);
    const { hook } = setup();

    await act(async () => {
      await hook.result.current.add("https://x.com/v", "320", "/out");
    });

    expect(hook.result.current.items).toHaveLength(1);
    expect(hook.result.current.items[0]).toMatchObject({
      url: "https://x.com/v",
      quality: "320",
      status: "queued",
      percent: 0,
    });
    expect(api.startDownload).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://x.com/v", quality: "320", outDir: "/out" }),
    );
  });

  it("marks the item failed and toasts when startDownload throws", async () => {
    vi.mocked(api.startDownload).mockRejectedValue(new Error("boom"));
    const { hook, fireToast, notify } = setup();

    await act(async () => {
      await hook.result.current.add("https://x.com/v", "320", "/out");
    });

    expect(hook.result.current.items[0].status).toBe("failed");
    expect(fireToast).toHaveBeenCalledWith(
      "error",
      "Falha no download",
      expect.stringContaining("boom"),
    );
    expect(notify).toHaveBeenCalledWith("❌ Falha no download", expect.stringContaining("boom"));
  });

  it("progress events transition the item through stages", async () => {
    vi.mocked(api.startDownload).mockResolvedValue(undefined);
    const { hook, emit } = setup();
    await waitFor(() => expect(api.onProgress).toHaveBeenCalled());

    await act(async () => {
      await hook.result.current.add("https://x.com/v", "320", "/out");
    });
    const id = hook.result.current.items[0].id;

    act(() => emit({ kind: "meta", id, title: "My Video" }));
    expect(hook.result.current.items[0].title).toBe("My Video");

    act(() =>
      emit({
        kind: "progress",
        id,
        percent: 42,
        speed: "1MiB/s",
        eta: "0:30",
        stage: "Baixando",
      }),
    );
    expect(hook.result.current.items[0]).toMatchObject({
      status: "downloading",
      percent: 42,
      stage: "Baixando",
    });

    act(() => emit({ kind: "done", id, path: "/out/x.mp3" }));
    expect(hook.result.current.items[0]).toMatchObject({
      status: "done",
      percent: 100,
      path: "/out/x.mp3",
    });
  });

  it("counts buckets correctly across statuses", async () => {
    vi.mocked(api.startDownload).mockResolvedValue(undefined);
    const { hook, emit } = setup();
    await waitFor(() => expect(api.onProgress).toHaveBeenCalled());

    await act(async () => {
      await hook.result.current.add("https://x.com/a", "320", "/o");
      await hook.result.current.add("https://x.com/b", "320", "/o");
      await hook.result.current.add("https://x.com/c", "320", "/o");
    });
    const [, idB, idA] = hook.result.current.items.map((i) => i.id);
    // newest-first ordering: items[0] is c, items[2] is a

    act(() => emit({ kind: "done", id: idA, path: "/o/a.mp3" }));
    act(() => emit({ kind: "failed", id: idB, reason: "x" }));

    expect(hook.result.current.counts).toEqual({ active: 1, done: 1, failed: 1 });
  });

  it("cancel removes the item and forwards the call", async () => {
    vi.mocked(api.startDownload).mockResolvedValue(undefined);
    vi.mocked(api.cancelDownload).mockResolvedValue(undefined);
    const { hook } = setup();

    await act(async () => {
      await hook.result.current.add("https://x.com/v", "320", "/o");
    });
    const id = hook.result.current.items[0].id;

    await act(async () => {
      await hook.result.current.cancel(id);
    });

    expect(hook.result.current.items).toHaveLength(0);
    expect(api.cancelDownload).toHaveBeenCalledWith(id);
  });
});
