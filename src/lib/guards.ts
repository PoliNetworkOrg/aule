// The source accepts numeric coordinates and custom elements with setDocked.
// Keep those exact checks in type guards (no schema dependency is needed).
export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

export function canDock(
  element: Element | null,
): element is HTMLElement & { setDocked(docked: boolean): void } {
  return element !== null && "setDocked" in element && typeof element.setDocked === "function";
}

function isCallable(value: unknown): value is (...args: never[]) => void {
  return typeof value === "function";
}

// Not every browser implements the View Transition API yet, though the DOM
// types declare it unconditionally.
export function supportsViewTransitions() {
  return isCallable(document.startViewTransition);
}
