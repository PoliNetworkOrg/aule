// The application keeps upstream's browser CDN import. Declare the API subset it uses.
declare module "https://cdn.jsdelivr.net/npm/@floating-ui/dom@1/+esm" {
  export type Side = "top" | "right" | "bottom" | "left";
  export type Placement = Side | `${Side}-start` | `${Side}-end`;
  export interface Middleware {
    name: string;
  }
  export function offset(
    value: number | ((state: { rects: { reference: DOMRect } }) => number),
  ): Middleware;
  export function flip(options?: { padding?: number }): Middleware;
  export function shift(options?: { padding?: number }): Middleware;
  export function arrow(options: { element: HTMLElement }): Middleware;
  export function computePosition(
    reference: Element,
    floating: HTMLElement,
    options: {
      placement?: Placement;
      strategy?: "absolute" | "fixed";
      middleware?: Middleware[];
    },
  ): Promise<{
    x: number;
    y: number;
    placement: Placement;
    middlewareData: { arrow?: { x?: number; y?: number } };
  }>;
}
