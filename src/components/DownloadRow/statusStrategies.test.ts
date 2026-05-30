import { describe, expect, it, vi } from "vitest";
import type { DownloadItem } from "../../types/download";
import { statusStrategies } from "./statusStrategies";

const baseItem: DownloadItem = {
  id: "1",
  url: "https://x.com/v",
  title: "Test",
  quality: "320",
  status: "queued",
  percent: 0,
  speed: "",
  eta: "",
  stage: "Na fila",
};

describe("statusStrategies", () => {
  it("declares every status from the union", () => {
    expect(Object.keys(statusStrategies).sort()).toEqual([
      "done",
      "downloading",
      "failed",
      "queued",
    ]);
  });

  it("marks queued and downloading as active (spin / progress visible)", () => {
    expect(statusStrategies.queued.active).toBe(true);
    expect(statusStrategies.downloading.active).toBe(true);
    expect(statusStrategies.done.active).toBe(false);
    expect(statusStrategies.failed.active).toBe(false);
  });

  it("renders badge only for terminal states", () => {
    expect(statusStrategies.queued.badge).toBeNull();
    expect(statusStrategies.downloading.badge).toBeNull();
    expect(statusStrategies.done.badge).toEqual({ symbol: "✓", className: "done" });
    expect(statusStrategies.failed.badge).toEqual({ symbol: "✕", className: "fail" });
  });

  describe("action wiring", () => {
    const callbacks = {
      onCancel: vi.fn(),
      onRetry: vi.fn(),
      onReveal: vi.fn(),
    };

    it("queued cancel button calls onCancel(id)", () => {
      const action = statusStrategies.queued.actions[0];
      action.onClick(baseItem, callbacks);
      expect(callbacks.onCancel).toHaveBeenCalledWith("1");
    });

    it("done open button calls onReveal(path)", () => {
      const item = { ...baseItem, status: "done" as const, path: "/x.mp3" };
      const action = statusStrategies.done.actions[0];
      action.onClick(item, callbacks);
      expect(callbacks.onReveal).toHaveBeenCalledWith("/x.mp3");
    });

    it("failed retry button calls onRetry(item)", () => {
      const item = { ...baseItem, status: "failed" as const };
      const action = statusStrategies.failed.actions[0];
      action.onClick(item, callbacks);
      expect(callbacks.onRetry).toHaveBeenCalledWith(item);
    });
  });
});
