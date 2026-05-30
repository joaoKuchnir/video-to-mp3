// Tab strip + counts. Data-driven so adding a tab = adding a row to TABS.

import type { Tab } from "../types/download";
import styles from "./Tabs.module.css";

interface TabDef {
  id: Tab;
  label: string;
  countKey: "active" | "done" | "failed";
}

const TABS: readonly TabDef[] = [
  { id: "active", label: "Em andamento", countKey: "active" },
  { id: "done", label: "Concluídos", countKey: "done" },
  { id: "failed", label: "Falhas", countKey: "failed" },
];

export interface TabsProps {
  active: Tab;
  counts: { active: number; done: number; failed: number };
  onChange: (tab: Tab) => void;
}

export function Tabs({ active, counts, onChange }: TabsProps) {
  return (
    <div className={styles.tabs}>
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`${styles.tab} ${active === t.id ? styles.active : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label} <span className={styles.count}>{counts[t.countKey]}</span>
        </button>
      ))}
    </div>
  );
}
