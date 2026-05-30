// Wraps the OS notification permission lifecycle in a single hook.
//
// SRP: this hook owns one concern — "can I notify, and how do I notify?".
// Components just call `notify(title, body)`; the hook decides whether the
// permission was granted at mount.

import { useCallback, useEffect, useRef } from "react";
import { ensureNotificationPermission, notifyOs } from "../api/downloads";

export interface UseOsNotifications {
  /** Fire an OS notification. Silent no-op if permission was denied. */
  notify: (title: string, body: string) => void;
}

export function useOsNotifications(): UseOsNotifications {
  // Ref (not state) — permission status doesn't drive renders.
  const granted = useRef(false);

  useEffect(() => {
    ensureNotificationPermission().then((ok) => {
      granted.current = ok;
    });
  }, []);

  // Stable reference: consumers that put `notify` in a `useEffect` dep array
  // (like `useDownloads`) must not re-subscribe on every render.
  const notify = useCallback<UseOsNotifications["notify"]>((title, body) => {
    if (granted.current) notifyOs(title, body);
  }, []);

  return { notify };
}
