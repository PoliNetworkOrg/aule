import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";
import { centreStable, insetFocus } from "./focus";

/** A row of mutually exclusive options (role="group" of aria-pressed buttons). */
export function Segmented({
  fill = false,
  className,
  ...props
}: ComponentProps<"div"> & { fill?: boolean }) {
  return (
    <div
      className={cn(
        "inline-flex gap-0.5 rounded-md border border-border bg-surface-muted p-[3px]",
        fill && "flex",
        className,
      )}
      {...props}
    />
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
        "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[calc(var(--radius-md)-3px)] px-3",
        "text-14 font-semibold whitespace-nowrap text-muted transition-[background-color,color] hover:text-foreground",
        "aria-pressed:bg-surface aria-pressed:text-accent-strong aria-pressed:shadow-sm",
        insetFocus,
        centreStable,
        fill && "flex-1 px-1.5",
        className,
      )}
      {...props}
    />
  );
}
