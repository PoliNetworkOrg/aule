/**
 * Controls inside scrolling rows and grids draw their focus ring inside, so
 * it's never clipped.
 */
export const insetFocus =
  "focus-visible:-outline-offset-2 focus-visible:shadow-[inset_0_0_0_4px_var(--color-surface)]";

/** Centres the visible text of a Stable label (./stable.tsx) inside its reserved width. */
export const centreStable = "[&_[data-slot=stable]]:justify-items-center";
