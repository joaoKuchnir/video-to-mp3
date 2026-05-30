import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import "./App.css";

type Status = "queued" | "downloading" | "done" | "failed";
type Quality = "320" | "192";

interface DownloadItem {
  id: string;
  url: string;
  title: string;
  quality: Quality;
  status: Status;
  percent: number;
  speed: string;
  eta: string;
  stage: string;
  path?: string;
  reason?: string;
}

type ProgressEvent =
  | { kind: "meta"; id: string; title: string }
  | { kind: "progress"; id: string; percent: number; speed: string; eta: string; stage: string }
  | { kind: "done"; id: string; path: string }
  | { kind: "failed"; id: string; reason: string }
  | { kind: "cancelled"; id: string };

interface Toast {
  id: string;
  type: "ok" | "error";
  title: string;
  sub: string;
}

type Tab = "active" | "done" | "failed";

let uid = 0;
const newId = () => `dl-${Date.now()}-${uid++}`;

function App() {
  const [url, setUrl] = useState("");
  const [quality, setQuality] = useState<Quality>("320");
  const [outDir, setOutDir] = useState("");
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [tab, setTab] = useState<Tab>("active");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notifyReady = useRef(false);

  useEffect(() => {
    invoke<string>("default_download_dir").then(setOutDir).catch(() => {});
    (async () => {
      try {
        let granted = await isPermissionGranted();
        if (!granted) granted = (await requestPermission()) === "granted";
        notifyReady.current = granted;
      } catch {
        notifyReady.current = false;
      }
    })();
  }, []);

  // Live progress events from Rust backend.
  useEffect(() => {
    const un = listen<ProgressEvent>("download-progress", (e) => {
      const p = e.payload;

      // Side effects (toast + OS notification) live OUTSIDE the state updater.
      // The updater must stay pure — StrictMode runs it twice in dev, which
      // would otherwise fire duplicate toasts/notifications.
      if (p.kind === "done") {
        const title = itemTitleRef.current[p.id] ?? "Download";
        fireToast("ok", "Download concluído", title);
        notify("✅ Download concluído", title);
      } else if (p.kind === "failed") {
        fireToast("error", "Falha no download", p.reason);
        notify("❌ Falha no download", p.reason);
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
      un.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track latest title per id so the "done" toast can show it without
  // reading state inside the event handler.
  const itemTitleRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const it of items) map[it.id] = it.title;
    itemTitleRef.current = map;
  }, [items]);

  function notify(title: string, body: string) {
    if (notifyReady.current) sendNotification({ title, body });
  }

  function fireToast(type: Toast["type"], title: string, sub: string) {
    const id = newId();
    setToasts((t) => [...t, { id, type, title, sub }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }

  async function pickFolder() {
    const dir = await open({ directory: true, defaultPath: outDir || undefined });
    if (typeof dir === "string") setOutDir(dir);
  }

  function isValidUrl(u: string) {
    return /^https?:\/\/.+/i.test(u.trim());
  }

  async function addDownload() {
    const u = url.trim();
    if (!isValidUrl(u) || !outDir) return;
    const id = newId();
    const item: DownloadItem = {
      id,
      url: u,
      title: u,
      quality,
      status: "queued",
      percent: 0,
      speed: "",
      eta: "",
      stage: "Na fila",
    };
    setItems((prev) => [item, ...prev]);
    setUrl("");
    setTab("active");
    try {
      await invoke("start_download", {
        args: { id, url: u, quality, outDir },
      });
    } catch (err) {
      const reason = String(err);
      fireToast("error", "Falha no download", reason);
      notify("❌ Falha no download", reason);
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, status: "failed", reason } : it,
        ),
      );
    }
  }

  async function cancel(id: string) {
    await invoke("cancel_download", { id }).catch(() => {});
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function retry(item: DownloadItem) {
    const id = newId();
    setItems((prev) => [
      { ...item, id, status: "queued", percent: 0, reason: undefined, stage: "Na fila" },
      ...prev.filter((it) => it.id !== item.id),
    ]);
    setTab("active");
    await invoke("retry_download", {
      args: { id, url: item.url, quality: item.quality, outDir },
    }).catch(() => {});
  }

  async function reveal(path?: string) {
    if (path) await revealItemInDir(path).catch(() => {});
  }

  const counts = useMemo(() => {
    let active = 0, done = 0, failed = 0;
    for (const it of items) {
      if (it.status === "done") done++;
      else if (it.status === "failed") failed++;
      else active++;
    }
    return { active, done, failed };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (tab === "done") return it.status === "done";
      if (tab === "failed") return it.status === "failed";
      return it.status === "queued" || it.status === "downloading";
    });
  }, [items, tab]);

  const canAdd = isValidUrl(url) && !!outDir;

  return (
    <div className="app">
      <div className="header">
        <div className="logo">🎵</div>
        <div>
          <h1>Video → MP3</h1>
          <div className="sub">Conversor de áudio em alta qualidade</div>
        </div>
      </div>

      <div className="input-card">
        <div className="url-row">
          <input
            className="url-input"
            placeholder="Cole o link do vídeo aqui..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDownload()}
          />
          <button className="btn-add" onClick={addDownload} disabled={!canAdd}>
            ＋ Baixar
          </button>
        </div>
        <div className="options-row">
          <span className="opt-label">Qualidade:</span>
          <div className="quality-toggle">
            <button
              className={quality === "320" ? "active" : ""}
              onClick={() => setQuality("320")}
            >
              320 kbps
            </button>
            <button
              className={quality === "192" ? "active" : ""}
              onClick={() => setQuality("192")}
            >
              192 kbps
            </button>
          </div>
        </div>
        <div className="folder-row">
          <span className="folder-path" title={outDir}>
            <span className="ico">📁</span>
            {outDir || "Carregando..."}
          </span>
          <button className="btn-folder" onClick={pickFolder}>
            Alterar pasta
          </button>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${tab === "active" ? "active" : ""}`}
          onClick={() => setTab("active")}
        >
          Baixando <span className="count">{counts.active}</span>
        </button>
        <button
          className={`tab ${tab === "done" ? "active" : ""}`}
          onClick={() => setTab("done")}
        >
          Concluídos <span className="count">{counts.done}</span>
        </button>
        <button
          className={`tab ${tab === "failed" ? "active" : ""}`}
          onClick={() => setTab("failed")}
        >
          Falhas <span className="count">{counts.failed}</span>
        </button>
      </div>

      <div className="list">
        {filtered.length === 0 ? (
          <div className="empty">
            {tab === "active"
              ? "Nenhum download em andamento. Cole um link acima."
              : tab === "done"
              ? "Nada concluído ainda."
              : "Nenhuma falha. 🎉"}
          </div>
        ) : (
          filtered.map((it) => <Row key={it.id} item={it} onCancel={cancel} onRetry={retry} onReveal={reveal} />)
        )}
      </div>

      <div className="status-bar">
        <span>
          <span className="dot" />
          {counts.active} baixando · {counts.done} concluídos · {counts.failed} falhas
        </span>
        <span>Máx. paralelo: 3</span>
      </div>

      <div className="toast-area">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === "error" ? "error" : ""}`}>
            <span className="t-ico">{t.type === "error" ? "❌" : "✅"}</span>
            <div>
              <div className="t-title">{t.title}</div>
              <div className="t-sub">{t.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({
  item,
  onCancel,
  onRetry,
  onReveal,
}: {
  item: DownloadItem;
  onCancel: (id: string) => void;
  onRetry: (it: DownloadItem) => void;
  onReveal: (path?: string) => void;
}) {
  const q = item.quality === "320" ? "q320" : "q192";
  const active = item.status === "queued" || item.status === "downloading";
  // Show a moving indeterminate bar while queued or before real progress
  // arrives, so a fast download never looks frozen at 0%.
  const indeterminate = active && item.percent <= 0;

  return (
    <div className="item">
      <div className="thumb">
        <div className={`vinyl ${active ? "spinning" : ""}`}>
          <span className="shine" />
          {item.status === "done" && <span className="vinyl-badge done">✓</span>}
          {item.status === "failed" && <span className="vinyl-badge fail">✕</span>}
        </div>
      </div>

      <div className="item-body">
        <div className="item-title" title={item.title}>{item.title}</div>
        <div className="item-meta">
          <span className={`badge ${q}`}>{item.quality} kbps</span>
          {item.status === "downloading" && (
            <>
              {item.speed && <span>{item.speed}</span>}
              {item.eta && (<><span>·</span><span>ETA {item.eta}</span></>)}
              <span>·</span>
              <span>{item.stage}</span>
            </>
          )}
          {item.status === "queued" && <span>Na fila...</span>}
          {item.status === "done" && <span>Concluído</span>}
          {item.status === "failed" && <span>Falhou</span>}
        </div>
        {active && (
          <div className="progress-wrap">
            {indeterminate ? (
              <div className="progress-bar">
                <div className="progress-fill indeterminate" />
              </div>
            ) : (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${item.percent}%` }} />
              </div>
            )}
          </div>
        )}
        {item.status === "failed" && item.reason && (
          <div className="fail-reason">⚠ {item.reason}</div>
        )}
      </div>

      <div className="item-status">
        {active && (
          <span className="pct">{indeterminate ? "…" : `${Math.round(item.percent)}%`}</span>
        )}
        {active && (
          <button className="icon-btn" title="Cancelar" onClick={() => onCancel(item.id)}>
            ✕
          </button>
        )}
        {item.status === "done" && (
          <button className="icon-btn" title="Abrir pasta" onClick={() => onReveal(item.path)}>
            📂
          </button>
        )}
        {item.status === "failed" && (
          <button className="icon-btn retry" title="Tentar novamente" onClick={() => onRetry(item)}>
            ↻
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
