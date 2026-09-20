import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";

let content: ReactNode = null;

const listeners = new Set<() => void>();

// The remaining startup controller calls this after locale loading. Keep its
// dependencies out of the shell's imports so custom elements still upgrade
// after React has committed their light-DOM children.
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
