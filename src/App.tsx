// Composition root. Owns only UI-local state (input field, current tab,
// chosen output dir) and wires hooks + presentational components together.

import { useEffect, useMemo, useState } from "react";
import styles from "./App.module.css";
import { getDefaultDownloadDir, pickFolder, revealFile } from "./api/downloads";
import { DownloadList } from "./components/DownloadList";
import { Header } from "./components/Header";
import { InputCard } from "./components/InputCard";
import { StatusBar } from "./components/StatusBar";
import { Tabs } from "./components/Tabs";
import { ToastArea } from "./components/ToastArea";
import { useDownloads } from "./hooks/useDownloads";
import { useOsNotifications } from "./hooks/useOsNotifications";
import { useToasts } from "./hooks/useToasts";
import type { DownloadItem, Quality, Tab } from "./types/download";
import { validateUrl } from "./utils/urlValidator";

function App() {
  const [url, setUrl] = useState("");
  const [quality, setQuality] = useState<Quality>("320");
  const [outDir, setOutDir] = useState("");
  const [tab, setTab] = useState<Tab>("active");
  // Touched flag: avoid yelling at the user before they typed anything.
  const [urlTouched, setUrlTouched] = useState(false);

  const { toasts, fireToast } = useToasts();
  const { notify } = useOsNotifications();
  const { items, counts, add, cancel, retry } = useDownloads({ fireToast, notify });

  useEffect(() => {
    getDefaultDownloadDir()
      .then(setOutDir)
      .catch(() => {});
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (tab === "done") return it.status === "done";
      if (tab === "failed") return it.status === "failed";
      return it.status === "queued" || it.status === "downloading";
    });
  }, [items, tab]);

  // Re-validated on every keystroke — single source of truth for both the
  // button enabled state and the inline error message.
  const validation = useMemo(() => validateUrl(url), [url]);
  const canSubmit = validation.ok && !!outDir;
  // Show error only after the field was touched and is non-empty — keeps the
  // first-paint clean.
  const urlError = urlTouched && !validation.ok ? validation.reason : "";

  function handleUrlChange(next: string) {
    setUrl(next);
    if (!urlTouched && next.length > 0) setUrlTouched(true);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    await add(url.trim(), quality, outDir);
    setUrl("");
    setUrlTouched(false);
    setTab("active");
  }

  async function handlePickFolder() {
    const dir = await pickFolder(outDir);
    if (dir) setOutDir(dir);
  }

  async function handleReveal(path?: string) {
    if (!path) return;
    try {
      await revealFile(path);
    } catch (err) {
      fireToast("error", "Não foi possível abrir a pasta", String(err));
    }
  }

  async function handleRetry(item: DownloadItem) {
    await retry(item, outDir);
    setTab("active");
  }

  return (
    <div className={styles.app}>
      <Header />
      <InputCard
        url={url}
        quality={quality}
        outDir={outDir}
        canSubmit={canSubmit}
        urlError={urlError}
        onUrlChange={handleUrlChange}
        onQualityChange={setQuality}
        onPickFolder={handlePickFolder}
        onSubmit={handleSubmit}
      />
      <Tabs active={tab} counts={counts} onChange={setTab} />
      <DownloadList
        items={filteredItems}
        tab={tab}
        onCancel={cancel}
        onRetry={handleRetry}
        onReveal={handleReveal}
      />
      <StatusBar counts={counts} />
      <ToastArea toasts={toasts} />
    </div>
  );
}

export default App;
