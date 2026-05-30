// Strategy Pattern (Gang of Four) — variant per download status.
//
// Each status owns its own slice of UI behaviour. The Row asks the table for
// the matching strategy and renders, never asking "what status is this?".
//
// Adding a new status (e.g. "paused") = one entry in `statusStrategies`.
// TypeScript enforces exhaustiveness via `Record<Status, …>`: a missing key
// is a compile error.
//
// Note on `styles`: passed as a parameter to `renderMeta` so this module
// stays decoupled from the concrete `.module.css` file — the Row owns the
// stylesheet, the strategy borrows class names from it.

import type { ReactNode } from "react";
import type { DownloadItem, Status } from "../../types/download";

/** Subset of the CSS module exposed to strategies. */
export type RowStyles = Readonly<Record<string, string>>;

/** Describes one clickable affordance the Row should render. */
export interface ActionDescriptor {
  /** Visible icon — kept here so the strategy fully owns rendering. */
  icon: string;
  /** Tooltip / aria-label. */
  title: string;
  /** Extra CSS class merged with `iconBtn` (resolved against the Row's module). */
  className?: string;
  /** Click handler. Receives the item; concrete behaviour is parent-owned. */
  onClick: (item: DownloadItem, callbacks: RowCallbacks) => void;
}

/** Callbacks the parent passes down. The strategy decides which to wire. */
export interface RowCallbacks {
  onCancel: (id: string) => void;
  onRetry: (item: DownloadItem) => void;
  onReveal: (path?: string) => void;
}

/** Vinyl badge in the upper-left corner of the disc. */
export interface VinylBadge {
  symbol: string;
  /** Suffix class joined with `vinylBadge` (resolved against the Row's module). */
  className: string;
}

/** Behavioural bundle for a single status. */
export interface StatusStrategy {
  /** Is the vinyl spinning / progress bar visible? */
  active: boolean;
  /** Optional badge over the vinyl when the work is finished. */
  badge: VinylBadge | null;
  /** Right-side meta text shown after the kbps badge. Pure function of the item. */
  renderMeta: (item: DownloadItem, styles: RowStyles) => ReactNode;
  /** Right-column actions. Order = render order. */
  actions: ActionDescriptor[];
}

/**
 * Render the meta line for an active (queued/downloading) item. Splits the
 * speed / ETA fragments off so we don't repeat them in two strategies.
 */
function renderActiveMeta(item: DownloadItem, styles: RowStyles): ReactNode {
  // Conversion phase: hide speed/ETA — they don't apply to ffmpeg muxing.
  if (item.stage === "Convertendo") {
    return <span className={styles.stageLabel}>Convertendo...</span>;
  }
  return (
    <>
      <span className={styles.stageLabel}>{item.stage || "Baixando"}...</span>
      {item.speed && (
        <>
          <span>·</span>
          <span>{item.speed}</span>
        </>
      )}
      {item.eta && (
        <>
          <span>·</span>
          <span>ETA {item.eta}</span>
        </>
      )}
    </>
  );
}

export const statusStrategies: Record<Status, StatusStrategy> = {
  queued: {
    active: true,
    badge: null,
    renderMeta: () => <span>Na fila...</span>,
    actions: [
      {
        icon: "✕",
        title: "Cancelar",
        onClick: (item, cb) => cb.onCancel(item.id),
      },
    ],
  },

  downloading: {
    active: true,
    badge: null,
    renderMeta: renderActiveMeta,
    actions: [
      {
        icon: "✕",
        title: "Cancelar",
        onClick: (item, cb) => cb.onCancel(item.id),
      },
    ],
  },

  done: {
    active: false,
    badge: { symbol: "✓", className: "done" },
    renderMeta: () => <span>Concluído</span>,
    actions: [
      {
        icon: "📂",
        title: "Abrir pasta",
        onClick: (item, cb) => cb.onReveal(item.path),
      },
    ],
  },

  failed: {
    active: false,
    badge: { symbol: "✕", className: "fail" },
    renderMeta: () => <span>Falhou</span>,
    actions: [
      {
        icon: "↻",
        title: "Tentar novamente",
        className: "retry",
        onClick: (item, cb) => cb.onRetry(item),
      },
    ],
  },
};
