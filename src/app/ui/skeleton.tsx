import { cn } from "../../lib/cn";

/** A shimmering placeholder block; size it with `className`. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "block animate-shimmer rounded-md bg-size-[300%_100%]",
        "bg-[linear-gradient(90deg,var(--color-surface-muted)_30%,var(--color-border)_50%,var(--color-surface-muted)_70%)]",
        className,
      )}
    />
  );
}
