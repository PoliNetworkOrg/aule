import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const noticeVariants = cva("flex items-center gap-2 rounded-md px-3 py-2 text-14", {
  variants: {
    tone: {
      warning: "border border-partial-border bg-partial-soft text-partial",
      error: "border border-busy-border bg-busy-soft text-busy",
    },
  },
});

/** A one-line banner; an action button in it goes last (`ml-auto min-h-8`). */
export function Notice({
  tone,
  className,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof noticeVariants>) {
  return <div className={cn(noticeVariants({ tone }), className)} {...props} />;
}

/** The classes for a button at the end of a Notice. */
export const noticeAction = "ml-auto min-h-8";
