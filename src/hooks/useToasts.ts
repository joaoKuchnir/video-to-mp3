// Owns the toast queue + auto-dismiss timer.
//
// SRP: components shouldn't know that toasts disappear after 4.5s — they call
// `fireToast(...)` and forget.

import { useCallback, useState } from "react";
import type { Toast } from "../types/download";
import { newId } from "../utils/ids";

const TOAST_TTL_MS = 4500;

export interface UseToasts {
  toasts: Toast[];
  fireToast: (type: Toast["type"], title: string, sub: string) => void;
}

export function useToasts(): UseToasts {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const fireToast = useCallback<UseToasts["fireToast"]>((type, title, sub) => {
    const id = newId("toast");
    setToasts((prev) => [...prev, { id, type, title, sub }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_TTL_MS);
  }, []);

  return { toasts, fireToast };
}
