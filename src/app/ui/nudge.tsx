import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

const DIRECTIONS = {
  left: "group-hover:-translate-x-0.5",
  right: "group-hover:translate-x-0.5",
  down: "group-hover:translate-y-0.5",
};

/**
 * A label and its arrow (or chevron), moving together a couple of pixels the
 * way the arrow points when the surrounding `group` is hovered. They are one
 * affordance: the arrow alone sliding off from its text reads as a glitch.
 */
export function Nudge({
  direction,
  className,
  ...props
}: ComponentProps<"span"> & { direction: keyof typeof DIRECTIONS }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 transition-[translate] duration-150 ease-smooth-out",
        DIRECTIONS[direction],
        className,
      )}
      {...props}
    />
  );
}
