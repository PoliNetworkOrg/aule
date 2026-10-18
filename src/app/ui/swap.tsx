import type { ReactNode } from "react";

/**
 * A changing value (a count, a label): when `value` changes the new one rises
 * in, so the change is seen rather than the text silently differing. Keyed by
 * `value`, so it also plays once on mount.
 */
export function Swap({ value, children }: { value: string | number; children?: ReactNode }) {
  return (
    <span key={value} className="inline-block animate-swap-in">
      {children ?? value}
    </span>
  );
}
