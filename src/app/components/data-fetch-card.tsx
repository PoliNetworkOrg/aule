import { useLayoutEffect, useSyncExternalStore } from "react";
import { createPortal, flushSync } from "react-dom";
import { DataFetchMotion } from "./data-fetch-motion";
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

export function DataFetchCard() {
  const status = useSyncExternalStore(subscribe, () => state);
  useSyncExternalStore(onTranslationChange, getTranslationVersion);
  useLayoutEffect(() => {
    const motion = new DataFetchMotion();

    return () => motion.destroy();
  }, []);

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
    <>
      <div className="dfc-overlay" hidden />
      <div className="dfc-popup liquid-glass" role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="dfc-popup__inner">
          <div id="data-fetch-indicator-popover-container" className="data-fetch-popover-container">
            {status && (
              <>
                <h1 className={`popover-title ${status.status}`}>
                  {t(`data.${status.status}Title`)}
                </h1>
                <p className="data-status-description secondary">
                  {t(`data.${status.status}Desc`)}
                </p>
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
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
