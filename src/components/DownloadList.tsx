// Renders the list area: rows or empty state. Empty-state copy is owned here
// (a tab-specific lookup) so App doesn't carry that knowledge.

import type { DownloadItem, Tab } from "../types/download";
import { DownloadRow } from "./DownloadRow";
import styles from "./DownloadList.module.css";

const EMPTY_COPY: Record<Tab, string> = {
  active: "Nenhum download em andamento. Cole um link acima.",
  done: "Nada concluído ainda.",
  failed: "Nenhuma falha. 🎉",
};

export interface DownloadListProps {
  items: DownloadItem[];
  tab: Tab;
  onCancel: (id: string) => void;
  onRetry: (item: DownloadItem) => void;
  onReveal: (path?: string) => void;
}

export function DownloadList({ items, tab, onCancel, onRetry, onReveal }: DownloadListProps) {
  if (items.length === 0) {
    return (
      <div className={styles.list}>
        <div className={styles.empty}>{EMPTY_COPY[tab]}</div>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {items.map((it) => (
        <DownloadRow
          key={it.id}
          item={it}
          onCancel={onCancel}
          onRetry={onRetry}
          onReveal={onReveal}
        />
      ))}
    </div>
  );
}
