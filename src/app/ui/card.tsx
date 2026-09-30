import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

/** A bordered surface; the content pages are made of these. */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface", className)} {...props} />
  );
}

/** Small uppercase heading ("Rooms 12", "Location"); an icon inside inherits its colour. */
export function SectionTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "flex items-center gap-1.5 text-13 font-bold tracking-wider text-muted uppercase",
        className,
      )}
      {...props}
    />
  );
}

/** The count after a SectionTitle's label. */
export function SectionCount({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("font-semibold text-subtle", className)} {...props} />;
}
