import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { t } from "../i18n";
import { createPillSelector } from "./pill-selector";
import { formatLocalDate, type DatePickerData, type PickerDay } from "./date-picker-state";

export { setupDatePicker } from "./date-picker-state";

interface DatePickerProps {
  data: DatePickerData | null;
  select: RefObject<HTMLSelectElement | null>;
}

function DayLabel({ day }: { day: PickerDay }) {
  return (
    <>
      <span className={`date-day-of-week ${day.sunday ? "date-sunday" : ""}`}>{day.weekday}</span>
      <span className="date-number">{day.day}</span>
    </>
  );
}

export function DatePicker({ data, select }: DatePickerProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const items = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLDivElement>(null);
  const activeRow = useRef<HTMLDivElement>(null);
  const hit = useRef<HTMLDivElement>(null);
  const todayBadge = useRef<HTMLDivElement>(null);
  const reposition = useRef<(() => void) | null>(null);

  const [hideSundays, setHideSundays] = useState(
    () => localStorage.getItem("poliAule_hideSundays") === "true",
  );

  useLayoutEffect(() => {
    function updateSundays(event: Event) {
      if (!(event instanceof CustomEvent)) return;
      const detail: { hidden: boolean } = event.detail;
      setHideSundays(detail.hidden);
    }

    window.addEventListener("hidesundayschange", updateSundays);

    return () => window.removeEventListener("hidesundayschange", updateSundays);
  }, []);
  useLayoutEffect(() => {
    const row = container.current;
    const root = wrapper.current;
    const dateSelect = select.current;
    const todayIndicator = todayBadge.current;

    if (
      !data ||
      !row ||
      !root ||
      !dateSelect ||
      !todayIndicator ||
      !items.current ||
      !indicator.current ||
      !activeRow.current ||
      !hit.current
    )
      return;
    const events = new AbortController();
    let frame = 0;

    const selector = createPillSelector(row, {
      rendered: {
        items: items.current,
        indicator: indicator.current,
        activeRow: activeRow.current,
        hit: hit.current,
      },
      onSelect(element) {
        const changed = dateSelect.value !== element.dataset.date;
        dateSelect.value = element.dataset.date!;

        if (changed) dateSelect.dispatchEvent(new Event("change", { bubbles: true }));
      },
    });

    function cells() {
      return [...row!.querySelectorAll<HTMLElement>(".date-element-container")];
    }

    function positionTodayIndicator() {
      const today = formatLocalDate(new Date());
      const cell = cells().find((element) => element.dataset.date === today);

      if (!cell) {
        todayIndicator!.classList.add("hidden");

        return;
      }

      todayIndicator!.classList.remove("hidden");
      const centerX = row!.offsetLeft + cell.offsetLeft + cell.offsetWidth / 2;
      const top = row!.offsetTop - todayIndicator!.offsetHeight - 8;
      todayIndicator!.style.left = `${centerX}px`;
      todayIndicator!.style.top = `${top}px`;
    }

    function reanchorFromValue() {
      if (selector.activeElement) return;
      const elements = cells();

      if (!elements.some((element) => element.offsetWidth > 0)) return;

      const cell = elements.find(
        (element) =>
          element.dataset.date === dateSelect!.value && !element.classList.contains("date-skipped"),
      );

      if (cell) selector.selectElement(cell, { silent: true, animate: false });
    }

    function repositionAll() {
      selector.refresh();
      reanchorFromValue();
      positionTodayIndicator();
    }

    reposition.current = repositionAll;
    todayIndicator.addEventListener(
      "click",
      () => {
        // Use the local calendar date (matching data-date's own
        // formatLocalDate), not toISOString() — which is UTC and picks the
        // wrong day between local midnight and 01:00/02:00 CET/CEST. (The
        // original vanilla-JS version had this same bug; it wasn't a
        // deliberate behavior to preserve.)
        const today = formatLocalDate(new Date());
        const cell = cells().find((element) => element.dataset.date === today);

        if (cell) selector.selectElement(cell);
      },
      { signal: events.signal },
    );
    window.addEventListener("resize", repositionAll, { signal: events.signal });
    document
      .getElementById("available-classrooms-container")
      ?.addEventListener("tabvisible", repositionAll, { signal: events.signal });
    const observer = new ResizeObserver(repositionAll);
    observer.observe(root);
    void document.fonts.ready.then(() => {
      if (events.signal.aborted) return;
      frame = requestAnimationFrame(() => {
        selector.refresh();
        const preferredDate = data.getPreferInitialDate();
        const elements = cells();

        const preferred =
          preferredDate &&
          elements.find(
            (element) =>
              element.dataset.date === preferredDate && !element.classList.contains("date-skipped"),
          );

        const firstAvailable = elements.find(
          (element) => !element.classList.contains("date-skipped"),
        );

        const initial = preferred || firstAvailable;

        if (initial) selector.selectElement(initial, { animate: false });
        positionTodayIndicator();
        row.style.opacity = "1";
      });
    });

    return () => {
      events.abort();
      observer.disconnect();
      cancelAnimationFrame(frame);
      selector.destroy();
      reposition.current = null;
    };
  }, [data, select]);
  useLayoutEffect(() => {
    reposition.current?.();
  }, [hideSundays]);

  const days = data?.days ?? [];

  return (
    <div
      ref={wrapper}
      className={`date-picker${hideSundays ? " date-picker--hide-sundays" : ""}`}
      data-react-owned=""
    >
      <div
        ref={todayBadge}
        id="today-indicator"
        className="hidden"
        aria-hidden="true"
        data-i18n="datepicker.today"
      >
        {t("datepicker.today")}
      </div>
      <div ref={container} className="date-picker-container">
        <div ref={items} className="date-picker-items">
          {days.map((day, index) => (
            <div
              key={day.date}
              className={`date-element-container${day.skipped ? " date-skipped" : ""}`}
              data-date={day.date}
              data-index={index}
            >
              <DayLabel day={day} />
            </div>
          ))}
        </div>
      </div>
      <div ref={indicator} className="date-indicator">
        <div className="date-indicator-inner">
          {/* Vitrium's pill core owns this row's children (one copy per cell). */}
          <div ref={activeRow} className="date-indicator-active-row" />
        </div>
      </div>
      <div ref={hit} className="date-indicator-hit" />
    </div>
  );
}
