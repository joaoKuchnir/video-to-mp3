// Top-of-screen identity. Static — no props needed today, but isolated so a
// future logo swap / theme toggle / settings button doesn't touch App.

import styles from "./Header.module.css";

export function Header() {
  return (
    <div className={styles.header}>
      <div className={styles.logo}>🎵</div>
      <div>
        <h1 className={styles.title}>Video → MP3</h1>
        <div className={styles.sub}>Conversor de áudio em alta qualidade</div>
      </div>
    </div>
  );
}
