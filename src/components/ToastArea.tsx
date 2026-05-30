// Floating toast stack. Dumb — receives the list, renders.

import type { Toast } from "../types/download";
import styles from "./ToastArea.module.css";

export interface ToastAreaProps {
  toasts: Toast[];
}

export function ToastArea({ toasts }: ToastAreaProps) {
  return (
    <div className={styles.area}>
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${t.type === "error" ? styles.error : ""}`}>
          <span className={styles.ico}>{t.type === "error" ? "❌" : "✅"}</span>
          <div>
            <div className={styles.title}>{t.title}</div>
            <div className={styles.sub}>{t.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
