// Owns the download list lifecycle: state, IPC events, add/cancel/retry.
//
// Side effects (toast + OS notification) are injected — the hook never
// imports them. That keeps the hook testable in isolation and respects DIP:
// it depends on the *function signatures*, not on `useToasts`/`useOsNotifications`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelDownload, onProgress, retryDownload, startDownload } from "../api/downloads";
import type { DownloadItem, Quality, Toast } from "../types/download";
import { newId } from "../utils/ids";

export interface UseDownloadsDeps {
  /** Toast factory. Use `useToasts().fireToast`. */
  fireToast: (type: Toast["type"], title: string, sub: string) => void;
  /** OS notification. Use `useOsNotifications().notify`. */
  notify: (title: string, body: string) => void;
}

export interface UseDownloads {
  items: DownloadItem[];
  counts: { active: number; done: number; failed: number };
  add: (url: string, quality: Quality, outDir: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  retry: (item: DownloadItem, outDir: string) => Promise<void>;
}

export function useDownloads({ fireToast, notify }: UseDownloadsDeps): UseDownloads {
  const [items, setItems] = useState<DownloadItem[]>([]);

  // Latest title per id — read inside the event listener without re-subscribing.
  const titlesById = useRef<Record<string, string>>({});
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const it of items) map[it.id] = it.title;
    titlesById.current = map;
  }, [items]);

  // Side-effect callbacks (toast / OS notification) read from refs so the
  // listener `useEffect` below stays subscribed exactly ONCE, even if the
  // parent re-renders and passes new function identities.
  const fireToastRef = useRef(fireToast);
  const notifyRef = useRef(notify);
  useEffect(() => {
    fireToastRef.current = fireToast;
    notifyRef.current = notify;
  }, [fireToast, notify]);

  // Subscribe to Rust progress events. Side effects live OUTSIDE the state
  // updater so React StrictMode double-invoke can't double-fire toasts.
  //
  // The effect runs once (empty deps). We track the Promise itself so that
  // when React tears the effect down BEFORE `onProgress` resolved, the
  // cleanup still waits for it and unsubscribes — preventing a "ghost"
  // listener from leaking into the next mount.
  useEffect(() => {
    let cancelled = false;
    const pending = onProgress((p) => {
      if (p.kind === "done") {
        const title = titlesById.current[p.id] ?? "Download";
        fireToastRef.current("ok", "Download concluído", title);
        notifyRef.current("✅ Download concluído", title);
      } else if (p.kind === "failed") {
        fireToastRef.current("error", "Falha no download", p.reason);
        notifyRef.current("❌ Falha no download", p.reason);
      }

      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== p.id) return it;
          switch (p.kind) {
            case "meta":
              return { ...it, title: p.title };
            case "progress":
              return {
                ...it,
                status: "downloading",
                percent: p.percent,
                speed: p.speed,
                eta: p.eta,
                stage: p.stage,
              };
            case "done":
              return { ...it, status: "done", percent: 100, path: p.path };
            case "failed":
              return { ...it, status: "failed", reason: p.reason };
            case "cancelled":
              return it; // removed separately
            default:
              return it;
          }
        }),
      );
    });

    return () => {
      cancelled = true;
      pending.then((unlisten) => {
        if (cancelled) unlisten();
      });
    };
  }, []);

  const add = useCallback<UseDownloads["add"]>(
    async (url, quality, outDir) => {
      const id = newId();
      const item: DownloadItem = {
        id,
        url,
        title: url,
        quality,
        status: "queued",
        percent: 0,
        speed: "",
        eta: "",
        stage: "Na fila",
      };
      setItems((prev) => [item, ...prev]);
      try {
        await startDownload({ id, url, quality, outDir });
      } catch (err) {
        const reason = String(err);
        fireToast("error", "Falha no download", reason);
        notify("❌ Falha no download", reason);
        setItems((prev) =>
          prev.map((it) => (it.id === id ? { ...it, status: "failed", reason } : it)),
        );
      }
    },
    [fireToast, notify],
  );

  const cancel = useCallback<UseDownloads["cancel"]>(async (id) => {
    await cancelDownload(id).catch(() => {});
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const retry = useCallback<UseDownloads["retry"]>(async (item, outDir) => {
    const id = newId();
    setItems((prev) => [
      { ...item, id, status: "queued", percent: 0, reason: undefined, stage: "Na fila" },
      ...prev.filter((it) => it.id !== item.id),
    ]);
    await retryDownload({ id, url: item.url, quality: item.quality, outDir }).catch(() => {});
  }, []);

  const counts = useMemo(() => {
    let active = 0;
    let done = 0;
    let failed = 0;
    for (const it of items) {
      if (it.status === "done") done++;
      else if (it.status === "failed") failed++;
      else active++;
    }
    return { active, done, failed };
  }, [items]);

  return { items, counts, add, cancel, retry };
}
