import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";
import { centreStable } from "./focus";

export const buttonVariants = cva(
  [
    "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-transparent px-4",
    "text-14 font-semibold whitespace-nowrap no-underline",
    "transition-[background-color,border-color,color] disabled:opacity-50",
    centreStable,
  ],
  {
    variants: {
      variant: {
        primary: "bg-accent text-on-accent hover:bg-accent-hover",
        ghost:
          "border-border bg-surface text-foreground hover:not-disabled:border-accent-soft-border hover:not-disabled:text-accent-strong",
      },
      size: {
        default: "",
        large: "min-h-[50px] w-full rounded-lg text-16",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

type ButtonVariants = VariantProps<typeof buttonVariants>;

/** Text buttons; links styled as buttons use `buttonVariants` directly. */
export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & ButtonVariants) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export const iconButtonVariants = cva(
  [
    "inline-grid place-items-center rounded-md text-muted transition-[background-color,color]",
    "hover:bg-surface-muted hover:text-foreground",
    "aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-strong",
  ],
  {
    variants: {
      size: {
        default: "size-10 text-18",
        small: "size-8 text-16",
      },
    },
    defaultVariants: { size: "default" },
  },
);

/** Square, icon-only buttons (close, info, theme, show on map…). */
export function IconButton({
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof iconButtonVariants>) {
  return <button type={type} className={cn(iconButtonVariants({ size }), className)} {...props} />;
}
