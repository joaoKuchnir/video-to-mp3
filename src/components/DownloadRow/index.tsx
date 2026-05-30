// Dumb row that defers all status-specific decisions to a Strategy table.
//
// Zero `item.status === …` checks — that knowledge lives in
// `./statusStrategies.tsx`. To support a new status, add a key there.

import type { DownloadItem } from "../../types/download";
import { statusStrategies, type RowCallbacks } from "./statusStrategies";
import styles from "./DownloadRow.module.css";

export interface DownloadRowProps extends RowCallbacks {
  item: DownloadItem;
}

export function DownloadRow({ item, onCancel, onRetry, onReveal }: DownloadRowProps) {
  const strategy = statusStrategies[item.status];
  const callbacks: RowCallbacks = { onCancel, onRetry, onReveal };
  const qualityClass = item.quality === "320" ? styles.q320 : styles.q192;
  // Show a moving indeterminate bar while queued or before real progress
  // arrives, so a fast download never looks frozen at 0%.
  const indeterminate = strategy.active && item.percent <= 0;

  return (
    <div className={styles.item}>
      <div className={styles.thumb}>
        <div className={`${styles.vinyl} ${strategy.active ? styles.spinning : ""}`}>
          <span className={styles.shine} />
          {strategy.badge && (
            <span className={`${styles.vinylBadge} ${styles[strategy.badge.className]}`}>
              {strategy.badge.symbol}
            </span>
          )}
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.title} title={item.title}>
          {item.title}
        </div>
        <div className={styles.meta}>
          <span className={`${styles.badge} ${qualityClass}`}>{item.quality} kbps</span>
          {strategy.renderMeta(item, styles)}
        </div>

        {strategy.active && (
          <div className={styles.progressWrap}>
            <div className={styles.progressBar}>
              {indeterminate ? (
                <div className={`${styles.progressFill} ${styles.indeterminate}`} />
              ) : (
                <div className={styles.progressFill} style={{ width: `${item.percent}%` }} />
              )}
            </div>
          </div>
        )}

        {item.reason && <div className={styles.failReason}>⚠ {item.reason}</div>}
      </div>

      <div className={styles.status}>
        {strategy.active && (
          <span className={styles.pct}>{indeterminate ? "…" : `${Math.round(item.percent)}%`}</span>
        )}
        {strategy.actions.map((action) => (
          <button
            key={action.title}
            className={`${styles.iconBtn} ${action.className ? styles[action.className] : ""}`.trim()}
            title={action.title}
            onClick={() => action.onClick(item, callbacks)}
          >
            {action.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
