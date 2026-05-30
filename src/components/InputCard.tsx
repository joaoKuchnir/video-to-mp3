// URL input + quality toggle + folder picker. Controlled component — all
// state (including validation) is owned by the parent so the input stays a
// single source of truth.

import type { Quality } from "../types/download";
import styles from "./InputCard.module.css";

export interface InputCardProps {
  url: string;
  quality: Quality;
  outDir: string;
  canSubmit: boolean;
  /** Empty string = no error; non-empty = display inline. */
  urlError: string;
  onUrlChange: (url: string) => void;
  onQualityChange: (quality: Quality) => void;
  onPickFolder: () => void;
  onSubmit: () => void;
}

export function InputCard({
  url,
  quality,
  outDir,
  canSubmit,
  urlError,
  onUrlChange,
  onQualityChange,
  onPickFolder,
  onSubmit,
}: InputCardProps) {
  const hasError = !!urlError;
  const inputClass = `${styles.input} ${hasError ? styles.inputError : ""}`.trim();

  return (
    <div className={styles.card}>
      <div className={styles.urlRow}>
        <input
          className={inputClass}
          placeholder="Cole o link do vídeo aqui..."
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          aria-invalid={hasError}
          aria-describedby={hasError ? "url-error" : undefined}
        />
        <button className={styles.btnAdd} onClick={onSubmit} disabled={!canSubmit}>
          ＋ Baixar
        </button>
      </div>

      {hasError && (
        <div id="url-error" className={styles.errorMsg} role="alert">
          ⚠ {urlError}
        </div>
      )}

      <div className={styles.optionsRow}>
        <span className={styles.optLabel}>Qualidade:</span>
        <div className={styles.qualityToggle}>
          <button
            className={quality === "320" ? styles.active : ""}
            onClick={() => onQualityChange("320")}
          >
            320 kbps
          </button>
          <button
            className={quality === "192" ? styles.active : ""}
            onClick={() => onQualityChange("192")}
          >
            192 kbps
          </button>
        </div>
      </div>

      <div className={styles.folderRow}>
        <span className={styles.folderPath} title={outDir}>
          <span className={styles.ico}>📁</span>
          {outDir || "Carregando..."}
        </span>
        <button className={styles.btnFolder} onClick={onPickFolder}>
          Alterar pasta
        </button>
      </div>
    </div>
  );
}
