import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

// The home's search parameters (Where, When, Filters, Favourites): a titled
// column of controls.

export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("flex flex-col gap-3.5 lg:gap-4", className)} {...props} />;
}

export function PanelHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex min-h-8 items-center justify-between gap-2", className)} {...props} />
  );
}

export function PanelTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "flex items-center gap-2 text-16 font-bold tracking-tight text-foreground",
        "icon:text-18 icon:text-accent",
        className,
      )}
      {...props}
    />
  );
}
