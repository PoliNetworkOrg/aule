import { useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";

export function Tooltip() {
  const tipRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  useLayoutEffect(() => {
    const tip = tipRef.current!;
    const events = new AbortController();
    let hideTimer = 0;
    document.addEventListener(
      "mouseenter",
      (e) => {
        if (!(e.target instanceof Element)) return;
        const el = e.target.closest<HTMLElement>("[data-tooltip]");

        if (!el) return;
        clearTimeout(hideTimer);
        flushSync(() => setText(el.dataset.tooltip ?? ""));
        tip.classList.add("app-tooltip--visible");
        const rect = el.getBoundingClientRect();
        const tipRect = tip.getBoundingClientRect();

        const left = Math.max(
          8,
          Math.min(
            rect.left + rect.width / 2 - tipRect.width / 2,
            window.innerWidth - tipRect.width - 8,
          ),
        );

        tip.style.left = `${left}px`;
        tip.style.top = `${rect.top - tipRect.height - 6 + window.scrollY}px`;
      },
      { capture: true, signal: events.signal },
    );
    document.addEventListener(
      "mouseleave",
      (e) => {
        if (!(e.target instanceof Element) || !e.target.closest("[data-tooltip]")) return;
        hideTimer = window.setTimeout(() => tip.classList.remove("app-tooltip--visible"), 80);
      },
      { capture: true, signal: events.signal },
    );

    return () => {
      events.abort();
      clearTimeout(hideTimer);
    };
  }, []);

  return createPortal(
    <div ref={tipRef} className="app-tooltip">
      {text}
    </div>,
    document.body,
  );
}
