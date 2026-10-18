import { useRef, type ComponentProps, type RefObject } from "react";
import { cn } from "../../lib/cn";
import { centreStable, insetFocus } from "./focus";
import { SlidingPill } from "./sliding-pill";

/** A row of mutually exclusive options (role="group" of aria-pressed buttons). */
export function Segmented({
  fill = false,
  className,
  children,
  ref,
  ...props
}: Omit<ComponentProps<"div">, "ref"> & {
  fill?: boolean;
  /** The row's element, for callers that need to reach into it. */
  ref?: RefObject<HTMLDivElement | null>;
}) {
  const own = useRef<HTMLDivElement>(null);
  const host = ref ?? own;

  return (
    <div
      ref={host}
      className={cn(
        "relative inline-flex gap-0.5 rounded-md border border-border bg-surface-muted p-[3px]",
        fill && "flex",
        className,
      )}
      {...props}
    >
      <SlidingPill host={host} className="rounded-[calc(var(--radius-md)-3px)]" />
      {children}
    </div>
  );
}

export function SegmentedOption({
  fill = false,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { fill?: boolean }) {
  return (
    <button
      type={type}
      className={cn(
        // Concentric with the group: its radius minus its 3px padding.
        "relative inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[calc(var(--radius-md)-3px)] px-3",
        "text-14 font-semibold whitespace-nowrap text-muted transition-[color] hover:text-foreground",
        "aria-pressed:text-accent-strong",
        insetFocus,
        centreStable,
        fill && "flex-1 px-1.5",
        className,
      )}
      {...props}
    />
  );
}
