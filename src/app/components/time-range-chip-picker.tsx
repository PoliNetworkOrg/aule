import { useLayoutEffect, useCallback, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { animateI18nElement, getTranslationVersion, onTranslationChange, t } from "../i18n";
import { createTimeFormatter } from "../utils/time-format";
import { PickerMotion } from "./picker-motion";
import { TimePicker } from "./time-picker";
import { TimeRangeSlider } from "./time-range-slider";
import { subscribeTimeControls, timeControlsReady } from "./time-controls-state";

function formatTime(value: string) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return "--:--";
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return createTimeFormatter({ hour: "numeric", minute: "2-digit" }).format(date);
}

export function TimeRangeChipPicker() {
  const host = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const renderSlider = useRef<(() => void) | null>(null);
  const from = useRef<HTMLInputElement>(null);
  const to = useRef<HTMLInputElement>(null);
  const [fromInput, setFromInput] = useState<HTMLInputElement | null>(null);
  const [toInput, setToInput] = useState<HTMLInputElement | null>(null);

  const bindFrom = useCallback((input: HTMLInputElement | null) => {
    from.current = input;
    setFromInput(input);
  }, []);

  const bindTo = useCallback((input: HTMLInputElement | null) => {
    to.current = input;
    setToInput(input);
  }, []);

  const [popup] = useState(() => {
    const element = document.createElement("div");
    element.className = "trc-popup liquid-glass";
    element.dataset.lgExclude = ".trs-bar-wrapper";
    element.setAttribute("role", "dialog");
    element.setAttribute("aria-modal", "true");
    element.tabIndex = -1;

    return element;
  });

  const ready = useSyncExternalStore(subscribeTimeControls, timeControlsReady);
  const language = useSyncExternalStore(onTranslationChange, getTranslationVersion);
  const previousLanguage = useRef(language);
  const [, setRevision] = useState(0);
  const [values, setValues] = useState({ from: "", to: "" });
  useLayoutEffect(() => {
    const element = host.current;
    const button = trigger.current;
    const backdrop = overlay.current;
    const content = inner.current;

    if (!element || !button || !backdrop || !content) return;
    document.body.appendChild(popup);

    const motion = new PickerMotion(element, button, backdrop, popup, content, "trc", 26, () =>
      renderSlider.current?.(),
    );

    const integration = Object.assign(element, {
      setDocked: (docked: boolean) => motion.setDocked(docked),
      retranslate: () => setRevision((revision) => revision + 1),
    });

    const events = new AbortController();

    const update = () =>
      setValues({
        from: formatTime(from.current?.value ?? ""),
        to: formatTime(to.current?.value ?? ""),
      });

    from.current?.addEventListener("input", update, { signal: events.signal });
    to.current?.addEventListener("input", update, { signal: events.signal });
    window.addEventListener("timeformatchange", update, { signal: events.signal });

    return () => {
      events.abort();
      motion.destroy();
      popup.remove();
      integration.setDocked = () => {};

      integration.retranslate = () => {};
    };
  }, [popup]);
  useLayoutEffect(() => {
    popup.setAttribute("aria-label", t("timepicker.timeLabel"));
    setValues({
      from: formatTime(from.current?.value ?? ""),
      to: formatTime(to.current?.value ?? ""),
    });

    if (previousLanguage.current !== language) {
      previousLanguage.current = language;
      trigger.current?.querySelectorAll<HTMLElement>("[data-i18n]").forEach(animateI18nElement);
      popup.querySelectorAll<HTMLElement>("[data-i18n]").forEach(animateI18nElement);
    }
  }, [ready, language, popup]);

  return (
    <time-range-chip-picker ref={host} data-loading={ready ? undefined : ""} data-react-owned="">
      <button
        ref={trigger}
        type="button"
        className="trc-trigger liquid-glass"
        aria-haspopup="dialog"
        aria-expanded="false"
      >
        <i className="hgi-stroke hgi-clock-01 trc-trigger__icon" aria-hidden="true" />
        <span className="trc-trigger__box">
          <span className="trc-trigger__label" data-i18n="timepicker.timeLabel">
            {t("timepicker.timeLabel")}
          </span>
          <span className="trc-trigger__skeleton" aria-hidden="true" />
          <span className="trc-trigger__value">
            <span className="trc-trigger__value-from">{values.from}</span>
            <span className="trc-trigger__value-sep" aria-hidden="true">
              –
            </span>
            <span className="trc-trigger__value-to">{values.to}</span>
          </span>
        </span>
        <i className="hgi-stroke hgi-arrow-down-01 trc-trigger__chevron" aria-hidden="true" />
      </button>
      <div className="time-pickers-container">
        <div className="time-picker">
          <input
            ref={bindFrom}
            type="time"
            id="from-time-picker"
            name="from"
            min="07:15"
            max="20:15"
            style={{ display: ready ? "none" : undefined }}
          />
          {ready && fromInput && <TimePicker input={fromInput} />}
        </div>
        <div className="time-picker">
          <input
            ref={bindTo}
            type="time"
            id="to-time-picker"
            name="to"
            min="07:15"
            max="20:15"
            style={{ display: ready ? "none" : undefined }}
          />
          {ready && toInput && <TimePicker input={toInput} />}
        </div>
      </div>
      {createPortal(<div ref={overlay} className="trc-overlay" hidden />, document.body)}
      {createPortal(
        <div ref={inner} className="trc-popup__inner" data-react-owned="">
          {ready && fromInput && toInput && (
            <TimeRangeSlider fromInput={fromInput} toInput={toInput} renderRef={renderSlider} />
          )}
        </div>,
        popup,
      )}
    </time-range-chip-picker>
  );
}
