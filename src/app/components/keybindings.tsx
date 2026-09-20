import { Fragment, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { t, onTranslationChange, getTranslationVersion } from "../i18n";
import { activateGroupTab } from "./bottom-nav.tsx";
import { openSearchOverlay } from "./search-overlay.tsx";
import { toggleSettings } from "./settings";

const desktopMQ = matchMedia("(min-width: 600px)");

const ROWS = [
  { keys: ["/"], i18n: "shortcuts.search" },
  { keys: ["1"], i18n: "shortcuts.tabAvailable" },
  { keys: ["2"], i18n: "shortcuts.tabCampus" },
  { keys: ["Ctrl", ","], i18n: "shortcuts.settings" },
  { keys: ["?"], i18n: "shortcuts.help" },
];

export function KeyboardShortcuts() {
  useSyncExternalStore(onTranslationChange, getTranslationVersion);
  const backdropRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const helpEl = backdropRef.current!;
    const events = new AbortController();
    let timer = 0;
    let frame = 0;

    function isHelpOpen() {
      return !helpEl.hidden;
    }

    function openHelp() {
      clearTimeout(timer);
      helpEl.hidden = false;
      frame = requestAnimationFrame(() => helpEl.classList.add("visible"));
    }

    function closeHelp() {
      if (!isHelpOpen()) return;
      cancelAnimationFrame(frame);
      helpEl.classList.remove("visible");

      const done = () => {
        if (!helpEl.classList.contains("visible")) helpEl.hidden = true;
      };

      helpEl.addEventListener("transitionend", done, { once: true, signal: events.signal });
      timer = window.setTimeout(done, 250);
    }

    function toggleHelp() {
      if (isHelpOpen()) closeHelp();
      else openHelp();
    }

    function isTypingContext(e: KeyboardEvent) {
      if (e.isComposing) return true;
      const el = e.target;

      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;

      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }

    // True while any full-screen overlay is up — the tab / search shortcuts stay
    // out of the way then (each overlay owns its own Escape handling).
    function anyOverlayOpen() {
      return (
        document.body.classList.contains("search-overlay-open") ||
        !!document.querySelector(".settings-overlay--active") ||
        !document.getElementById("classroom-detail-overlay")?.hidden ||
        !document.getElementById("info-page-overlay")?.hidden ||
        isHelpOpen()
      );
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!desktopMQ.matches) return;

      // Ctrl/Cmd + ,  → settings. Works regardless of focus (as long as it's not a
      // text field, where a comma should just be typed).
      if ((e.ctrlKey || e.metaKey) && e.key === "," && !e.altKey && !e.shiftKey) {
        if (isTypingContext(e)) return;
        e.preventDefault();
        toggleSettings();

        return;
      }

      // Everything below is a bare key — ignore it with modifiers held or while
      // typing.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (isTypingContext(e)) return;

      if (e.key === "Escape") {
        if (isHelpOpen()) {
          e.preventDefault();
          closeHelp();
        }

        return;
      }

      if (e.key === "?") {
        // Shift + / on most layouts
        e.preventDefault();
        toggleHelp();

        return;
      }

      // The remaining shortcuts navigate the shell — skip them behind an overlay.
      if (anyOverlayOpen()) return;

      switch (e.key) {
        case "/":
        case "s":
          e.preventDefault();
          openSearchOverlay();
          break;
        case "1":
          e.preventDefault();
          activateGroupTab("available-classrooms-container");
          break;
        case "2":
          e.preventDefault();
          activateGroupTab("search-classrooms-container");
          break;
      }
    }

    document.addEventListener("keydown", onKeyDown, { signal: events.signal });
    helpEl.addEventListener(
      "click",
      (e) => {
        if (e.target === helpEl) closeHelp();
      },
      { signal: events.signal },
    );

    return () => {
      events.abort();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, []);

  return createPortal(
    <div ref={backdropRef} className="kb-help-backdrop" hidden>
      <div
        className="kb-help-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("shortcuts.title")}
      >
        <h2 className="kb-help-title" data-react-owned="" data-i18n="shortcuts.title">
          {t("shortcuts.title")}
        </h2>
        <dl className="kb-help-list">
          {ROWS.map((row) => (
            <Fragment key={row.i18n}>
              <dt>
                {row.keys.map((key, index) => (
                  <Fragment key={key}>
                    {index > 0 ? " " : null}
                    <kbd>{key}</kbd>
                  </Fragment>
                ))}
              </dt>
              <dd data-react-owned="" data-i18n={row.i18n}>
                {t(row.i18n)}
              </dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </div>,
    document.body,
  );
}
