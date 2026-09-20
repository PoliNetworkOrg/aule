import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "campus-sheet-picker": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      "campus-chip-picker": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      "date-chip-picker": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      "time-range-chip-picker": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
