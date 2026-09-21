import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createPortal, flushSync } from "react-dom";
import { createMorphPopup, attachLiquidGlass } from "vitrium";
import {
  t,
  getLocale,
  onTranslationChange,
  getTranslationVersion,
  animateI18nElement,
} from "../i18n";

type Status = "green" | "yellow" | "red";

interface FetchStatus {
  status: Status;
  generated: Date | null;
  reload: () => Promise<void>;
  reloading: boolean;
}

let state: FetchStatus | null = null;

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  flushSync(() => listeners.forEach((listener) => listener()));
}

export function renderDataFetchStatus(
  status: Status,
  generated: Date | null,
  reload: () => Promise<void>,
  animate = false,
) {
  state = { status, generated, reload, reloading: false };
  notify();
  const container = document.getElementById("data-fetch-indicator-popover-container");

  if (animate && container) animateI18nElement(container);
}

export function setDataFetchReloading(reloading: boolean) {
  if (state) {
    state = { ...state, reloading };
    notify();
  }
}

// The header's data-fetch indicator button morphs into a glass card holding the
// freshness status + reload button, and back: Vitrium's morph popup, with the
// button as its trigger. Unlike the pickers there is no title bar, so the whole
// card takes the press / drag deform.
//
// React keeps ownership of the container's contents; the container element is
// only relocated into the card.
export function DataFetchCard() {
  const status = useSyncExternalStore(subscribe, () => state);
  useSyncExternalStore(onTranslationChange, getTranslationVersion);

  const [container] = useState(() => {
    const element = document.createElement("div");

    element.id = "data-fetch-indicator-popover-container";
    element.className = "data-fetch-popover-container";

    return element;
  });

  useLayoutEffect(() => {
    const trigger = document.getElementById("data-fetch-btn");

    if (!trigger) return;

    const popup = createMorphPopup({
      trigger,
      role: "dialog",
      label: trigger.getAttribute("aria-label") ?? "",
      width: 20 * 16,
    });

    popup.inner.appendChild(container);

    const stopGlass = attachLiquidGlass(popup.panel);
    const events = new AbortController();

    trigger.addEventListener("click", () => popup.toggle(), { signal: events.signal });

    // The reload button is re-rendered with the status; close the card
    // whenever a click inside it lands on that button.
    popup.inner.addEventListener(
      "click",
      (e: Event) => {
        if (e.target instanceof Element && e.target.closest("#reload-data-btn")) popup.close();
      },
      { signal: events.signal },
    );

    return () => {
      events.abort();
      container.remove();
      stopGlass();
      popup.destroy();
    };
  }, [container]);

  const formattedTime = status?.generated
    ? status.generated.toLocaleString(getLocale() === "it" ? "it-IT" : "en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Rome",
      })
    : "—";

  return createPortal(
    status && (
      <>
        <h1 className={`popover-title ${status.status}`}>{t(`data.${status.status}Title`)}</h1>
        <p className="data-status-description secondary">{t(`data.${status.status}Desc`)}</p>
        <label className="data-status-time secondary">
          {t("data.lastFetched")}: {formattedTime}
        </label>
        <button
          id="reload-data-btn"
          className="button-primary button-secondary data-reload-btn"
          disabled={status.reloading}
          onClick={() => void status.reload()}
        >
          <i
            className={`hgi-stroke hgi-refresh data-reload-icon${status.reloading ? " spinning" : ""}`}
            aria-hidden="true"
          />
          <span className="data-reload-label">
            {t(status.reloading ? "data.reloading" : "data.reload")}
          </span>
        </button>
      </>
    ),
    container,
  );
}
