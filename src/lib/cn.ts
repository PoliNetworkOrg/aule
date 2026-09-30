import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge has to know the theme's numeric type scale (src/styles.css),
// or it reads `text-13` as a colour and drops it next to `text-muted`. Those
// sizes set no line-height, so they don't displace a `leading-*` either.
const merge = extendTailwindMerge({
  override: {
    conflictingClassGroups: { "font-size": [] },
  },
  extend: {
    theme: {
      text: ["10", "11", "12", "13", "14", "15", "16", "17", "18", "20", "26", "28", "30", "32"],
      spacing: ["gutter", "header"],
    },
  },
});

/** Joins class names, letting later utilities override conflicting earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
