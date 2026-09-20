import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { getLocale, getTranslationVersion, onLanguageSwitch, t, animateI18nElement } from "../i18n";
import { DatePicker } from "./date-picker";
import { PickerMotion } from "./picker-motion";
import { getDatePickerData, subscribeDates } from "./date-picker-state";

function createPopupContainer() {
  const popup = document.createElement("div");
  popup.className = "dcp-popup liquid-glass";
  popup.dataset.lgExclude = ".date-picker";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-modal", "true");
  popup.tabIndex = -1;

  return popup;
}

export function DateChipPicker() {
  const host = useRef<HTMLElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [popup] = useState(createPopupContainer);
  const data = useSyncExternalStore(subscribeDates, getDatePickerData);
  const translationVersion = useSyncExternalStore(onLanguageSwitch, getTranslationVersion);
  const previousTranslation = useRef(translationVersion);
  const [startupTranslation, setStartupTranslation] = useState(0);
  const [value, setValue] = useState("");

  useLayoutEffect(() => {
    const element = host.current;
    const button = trigger.current;
    const backdrop = overlay.current;
    const content = inner.current;
    const dateSelect = select.current;

    if (!element || !button || !backdrop || !content || !dateSelect) return;
    document.body.appendChild(popup);
    const motion = new PickerMotion(element, button, backdrop, popup, content);

    // The remaining docking/startup controllers call these methods on the
    // original tag. There is no custom element renderer competing with React.
    const integration = Object.assign(element, {
      setDocked: (docked: boolean) => motion.setDocked(docked),
      retranslate: () => setStartupTranslation((revision) => revision + 1),
    });

    const updateValue = () => setValue(dateSelect.value);
    dateSelect.addEventListener("change", updateValue);

    return () => {
      dateSelect.removeEventListener("change", updateValue);
      motion.destroy();
      popup.remove();
      // Keep detached elements inert if a legacy controller still holds one.
      integration.setDocked = () => {};

      integration.retranslate = () => {};
    };
  }, [popup]);
  useLayoutEffect(() => {
    popup.setAttribute("aria-label", t("datepicker.label"));
    setValue(select.current?.value ?? "");

    if (previousTranslation.current !== translationVersion) {
      previousTranslation.current = translationVersion;
      trigger.current?.querySelectorAll<HTMLElement>("[data-i18n]").forEach(animateI18nElement);
      popup.querySelectorAll<HTMLElement>("[data-i18n]").forEach(animateI18nElement);
    }
  }, [popup, translationVersion, startupTranslation]);

  let date: Date;

  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = new Date();
  }

  const locale = getLocale();
  const main = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" }).format(date);
  const month = new Intl.DateTimeFormat(locale, { month: "short" }).format(date);
  const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
  const now = new Date();

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  useLayoutEffect(() => {
    trigger.current?.classList.toggle("dcp-trigger--today", isToday);
  }, [isToday]);

  return (
    <date-chip-picker ref={host} data-loading="" data-react-owned="">
      <select ref={select} id="date-picker" name="date" hidden>
        {data?.options.map((date, index) => (
          <option key={`${index}-${date}`} value={date}>
            {date}
          </option>
        ))}
      </select>
      <button
        ref={trigger}
        type="button"
        className="dcp-trigger liquid-glass"
        aria-haspopup="dialog"
        aria-expanded="false"
      >
        <i className="hgi-stroke hgi-calendar-03 dcp-trigger__icon" aria-hidden="true" />
        <span className="dcp-trigger__box">
          <span className="dcp-trigger__label" data-i18n="datepicker.label">
            {t("datepicker.label")}
          </span>
          <span className="dcp-trigger__skeleton" aria-hidden="true" />
          <span className="dcp-trigger__value">
            <span className="dcp-trigger__value-main">{capitalize(main)}</span>
            <span className="dcp-trigger__value-month">{capitalize(month.replace(/\.$/, ""))}</span>
          </span>
        </span>
        <i className="hgi-stroke hgi-arrow-down-01 dcp-trigger__chevron" aria-hidden="true" />
        <span className="dcp-trigger__today-badge" data-i18n="datepicker.today" hidden={!isToday}>
          {t("datepicker.today")}
        </span>
      </button>
      {createPortal(<div ref={overlay} className="dcp-overlay" hidden />, document.body)}
      {createPortal(
        <div ref={inner} className="dcp-popup__inner" data-react-owned="">
          <div className="dcp-popup__title" aria-hidden="true">
            <i className="hgi-stroke hgi-calendar-03 dcp-popup__title-icon" />
            <span className="dcp-popup__title-text" data-i18n="datepicker.label">
              {t("datepicker.label")}
            </span>
          </div>
          <DatePicker data={data} select={select} />
        </div>,
        popup,
      )}
    </date-chip-picker>
  );
}
