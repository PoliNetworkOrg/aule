import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

export const tagVariants = cva(
  "inline-flex h-[22px] items-center gap-1 rounded-sm px-2 text-12 font-bold whitespace-nowrap tabular-nums",
  {
    variants: {
      tone: {
        free: "bg-free-soft text-free",
        partial: "bg-partial-soft text-partial",
        occupied: "bg-busy-soft text-busy",
        closed: "bg-surface-muted text-muted",
        exam: "bg-exam-soft text-exam",
        now: "bg-accent-soft text-accent-strong",
      },
    },
  },
);

/** A small status label: "Free", "11:30–12:15", "Exam", "Now"… */
export function Tag({
  tone,
  className,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof tagVariants>) {
  return <span className={cn(tagVariants({ tone }), className)} {...props} />;
}

export const statusDotVariants = cva("size-2 flex-none rounded-full bg-neutral", {
  variants: {
    status: {
      free: "bg-free",
      partial: "bg-partial",
      occupied: "bg-busy",
      closed: "bg-neutral",
      unknown: "",
    },
  },
});

/** The coloured dot before a room's name; decorative, the status is also spelled out. */
export function StatusDot({
  status,
  className,
}: VariantProps<typeof statusDotVariants> & { className?: string }) {
  return <span className={cn(statusDotVariants({ status }), className)} aria-hidden="true" />;
}
