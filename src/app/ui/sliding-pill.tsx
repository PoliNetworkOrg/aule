import { useEffect, useLayoutEffect, useRef, type ComponentProps, type RefObject } from "react";
import { cn } from "../../lib/cn";

/**
 * The highlight behind the pressed option of a row of aria-pressed buttons,
 * sliding from one option to the next instead of jumping. The row must be
 * `relative` and its options `relative` too, so they paint above the pill.
 */
export function SlidingPill({
  host,
  className,
  ...props
}: { host: RefObject<HTMLElement | null> } & ComponentProps<"span">) {
  const pill = useRef<HTMLSpanElement>(null);

  // Writes straight to the DOM: the pressed option changes with every render of
  // the row, and a state update here would only render again.
  useLayoutEffect(() => {
    const row = host.current;
    const mark = pill.current;

    if (!row || !mark) return;

    const active = row.querySelector<HTMLElement>("[aria-pressed='true']");

    if (!active) {
      mark.style.opacity = "0";

      return;
    }

    mark.style.opacity = "";
    mark.style.width = `${active.offsetWidth}px`;
    mark.style.height = `${active.offsetHeight}px`;
    mark.style.translate = `${active.offsetLeft}px ${active.offsetTop}px`;
  });

  // Resizes (a language change, a wrapping row) move the options without a render.
  useEffect(() => {
    const row = host.current;
    const mark = pill.current;

    if (!row || !mark) return;

    const frame = requestAnimationFrame(() => {
      mark.dataset.ready = "true";
    });

    const observer = new ResizeObserver(() => {
      const active = row.querySelector<HTMLElement>("[aria-pressed='true']");

      if (!active) return;

      // Placed, not slid: the row only changed size (or came back from `hidden`).
      mark.style.transition = "none";
      mark.style.width = `${active.offsetWidth}px`;
      mark.style.height = `${active.offsetHeight}px`;
      mark.style.translate = `${active.offsetLeft}px ${active.offsetTop}px`;
      void mark.offsetWidth;
      mark.style.transition = "";
    });

    observer.observe(row);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [host]);

  return (
    <span
      ref={pill}
      className={cn(
        "pointer-events-none absolute top-0 left-0 bg-surface shadow-sm",
        // Not before the first placement, or it would slide in from the corner.
        "data-[ready=true]:transition-[translate,width,height,opacity] data-[ready=true]:duration-250 data-[ready=true]:ease-smooth-out",
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
}
