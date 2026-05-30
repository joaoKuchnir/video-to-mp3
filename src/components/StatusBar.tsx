// Bottom strip with aggregate counts and parallel-cap hint.

import styles from "./StatusBar.module.css";

const MAX_PARALLEL = 3;

export interface StatusBarProps {
  counts: { active: number; done: number; failed: number };
}

export function StatusBar({ counts }: StatusBarProps) {
  return (
    <div className={styles.statusBar}>
      <span>
        <span className={styles.dot} />
        {counts.active} em andamento · {counts.done} concluídos · {counts.failed} falhas
      </span>
      <span>Máx. paralelo: {MAX_PARALLEL}</span>
    </div>
  );
}
