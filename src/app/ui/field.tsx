import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

/** A labelled group of controls: a fieldset with its legend. */
export function Field({ className, ...props }: ComponentProps<"fieldset">) {
  return <fieldset className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function FieldLabel({ className, ...props }: ComponentProps<"legend">) {
  return (
    <legend
      className={cn("mb-1.5 text-12 font-semibold tracking-wider text-muted uppercase", className)}
      {...props}
    />
  );
}
