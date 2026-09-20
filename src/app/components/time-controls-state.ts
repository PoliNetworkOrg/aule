import { flushSync } from "react-dom";

let ready = false;

const listeners = new Set<() => void>();

export function subscribeTimeControls(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function timeControlsReady() {
  return ready;
}

export function initTimeControls() {
  ready = true;
  flushSync(() => listeners.forEach((listener) => listener()));
}
