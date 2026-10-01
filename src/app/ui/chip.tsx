import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";
import { insetFocus } from "./focus";
import { pressable } from "./motion";

// Pill toggles and actions: filters, professors, "remove this filter" hints.
// Pressed (aria-pressed) and open (aria-expanded) chips light up in the accent.

const chipVariants = cva(
  [
    "inline-flex h-9 flex-none items-center gap-1.5 rounded-full border border-border bg-surface px-3",
    "text-14 font-medium whitespace-nowrap text-foreground",
    "transition-[background-color,border-color,color,scale] icon:text-subtle hover:border-border-strong",
    pressable,
    "aria-pressed:border-accent-soft-border aria-pressed:bg-accent-soft aria-pressed:text-accent-strong aria-pressed:icon:text-accent",
    "aria-expanded:border-accent-soft-border aria-expanded:bg-accent-soft aria-expanded:text-accent-strong aria-expanded:icon:text-accent",
    insetFocus,
  ],
  {
    variants: {
      variant: {
        default: "",
        /** Has settings applied while closed. */
        active: "border-accent-soft-border text-accent-strong",
        /** Removes a filter from the results hints. */
        impact: "border-dashed",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Chip({
  variant,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof chipVariants>) {
  return <button type={type} className={cn(chipVariants({ variant }), className)} {...props} />;
}

/** Chips flowing onto as many lines as they need. */
export function ChipRow({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("-my-1 flex flex-wrap gap-2 py-1", className)} {...props} />;
}
