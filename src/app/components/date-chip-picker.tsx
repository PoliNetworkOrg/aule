import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { getLocale, getTranslationVersion, onTranslationChange, t } from "../i18n";
import { DatePicker } from "./date-picker";
import { ChipShell } from "./chip-shell";
import { getDatePickerData, subscribeDates } from "./date-picker-state";

// A thin wrapper around the sliding date picker. The pill, the morph and the
// panel are Vitrium's chip picker (see chip-shell.ts, which also handles the
// docked desktop mode). This component adds the collapsed date label ("Tue 15"
// over "Sep") and the "Today" badge, rendered into the chip's own slots.
export function DateChipPicker() {
  const host = useRef<HTMLElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const shell = useRef<ChipShell | null>(null);

  const [body] = useState(() => {
    const element = document.createElement("div");

    element.className = "dcp-content";

    return element;
  });

  const [slots, setSlots] = useState<{ trigger: HTMLElement; value: HTMLElement } | null>(null);
  const data = useSyncExternalStore(subscribeDates, getDatePickerData);
  const translationVersion = useSyncExternalStore(onTranslationChange, getTranslationVersion);
  const [startupTranslation, setStartupTranslation] = useState(0);
  const [value, setValue] = useState("");

  useLayoutEffect(() => {
    const element = host.current;
    const dateSelect = select.current;

    if (!element || !dateSelect) return;

    const chips = new ChipShell(element, {
      icon: "hgi-calendar-03",
      labelKey: "datepicker.label",
      width: 24 * 16,
      body,
      exclude: ".date-picker",
      onBuild(chip) {
        const valueEl = chip.trigger.querySelector<HTMLElement>(".lg-chip__value")!;

        valueEl.classList.add("dcp-value");
        setSlots({ trigger: chip.trigger, value: valueEl });
      },
    });

    shell.current = chips;

    // The remaining docking/startup controllers call these methods on the
    // original tag. There is no custom element renderer competing with React.
    const integration = Object.assign(element, {
      setDocked: (docked: boolean) => {
        chips.setDocked(docked);

        // The sliding picker had no layout while it was hidden; nudge its
        // ResizeObserver on the reveal.
        if (docked) window.dispatchEvent(new Event("resize"));
      },
      retranslate: () => setStartupTranslation((revision) => revision + 1),
    });

    const updateValue = () => setValue(dateSelect.value);

    dateSelect.addEventListener("change", updateValue);

    return () => {
      dateSelect.removeEventListener("change", updateValue);
      chips.destroy();
      shell.current = null;
      setSlots(null);
      // Keep detached elements inert if a legacy controller still holds one.
      integration.setDocked = () => {};

      integration.retranslate = () => {};
    };
  }, [body]);
  useLayoutEffect(() => {
    shell.current?.retranslate();
    setValue(select.current?.value ?? "");
  }, [translationVersion, startupTranslation, slots]);

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
    slots?.trigger.classList.toggle("dcp-trigger--today", isToday);
  }, [isToday, slots]);

  return (
    <date-chip-picker ref={host} data-loading="" data-react-owned="">
      <select ref={select} id="date-picker" name="date" hidden>
        {data?.options.map((date, index) => (
          <option key={`${index}-${date}`} value={date}>
            {date}
          </option>
        ))}
      </select>
      {slots &&
        createPortal(
          <>
            <span className="chip-skeleton dcp-skeleton" aria-hidden="true" />
            <span>{capitalize(main)}</span>
            <span className="dcp-value__month">{capitalize(month.replace(/\.$/, ""))}</span>
          </>,
          slots.value,
        )}
      {slots &&
        createPortal(
          <span className="dcp-today-badge" data-i18n="datepicker.today" hidden={!isToday}>
            {t("datepicker.today")}
          </span>,
          slots.trigger,
        )}
      {createPortal(<DatePicker data={data} select={select} />, body)}
    </date-chip-picker>
  );
}
