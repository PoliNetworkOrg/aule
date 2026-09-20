import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";

let content: ReactNode = null;

const listeners = new Set<() => void>();

// Application initialization publishes the popup after the locale and directory
// load. React owns its portal and releases the popup effects on unmount.
export function mountSettings(popup: ReactNode) {
  content = popup;
  flushSync(() => listeners.forEach((listener) => listener()));
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function Settings() {
  const popup = useSyncExternalStore(subscribe, () => content);

  return popup ? createPortal(popup, document.body) : null;
}
