import { useLayoutEffect, useCallback, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { getTranslationVersion, onTranslationChange } from "../i18n";
import { createTimeFormatter } from "../utils/time-format";
import { ChipShell } from "./chip-shell";
import { TimePicker, TimePickerBackdrop } from "./time-picker";
import { TimeRangeSlider } from "./time-range-slider";
import { subscribeTimeControls, timeControlsReady } from "./time-controls-state";

function formatTime(value: string) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return "--:--";
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return createTimeFormatter({ hour: "numeric", minute: "2-digit" }).format(date);
}

// A thin wrapper around the drag-based time range slider. The pill, the morph
// and the panel are Vitrium's chip picker (see chip-shell.ts, which also handles
// the docked desktop mode). This component adds the collapsed range label
// ("9:15 – 11:15"), rendered into the chip's own value slot.
//
// The two native <input type="time"> fields stay direct children of the element
// so they remain submittable fields inside the <form>; only the slider is
// relocated into the panel.
export function TimeRangeChipPicker() {
  const host = useRef<HTMLElement>(null);
  const shell = useRef<ChipShell | null>(null);
  const renderSlider = useRef<(() => void) | null>(null);
  const from = useRef<HTMLInputElement>(null);
  const to = useRef<HTMLInputElement>(null);
  const [fromInput, setFromInput] = useState<HTMLInputElement | null>(null);
  const [toInput, setToInput] = useState<HTMLInputElement | null>(null);
  const [valueEl, setValueEl] = useState<HTMLElement | null>(null);

  const bindFrom = useCallback((input: HTMLInputElement | null) => {
    from.current = input;
    setFromInput(input);
  }, []);

  const bindTo = useCallback((input: HTMLInputElement | null) => {
    to.current = input;
    setToInput(input);
  }, []);

  const [body] = useState(() => {
    const element = document.createElement("div");

    element.className = "trc-content";

    return element;
  });

  const ready = useSyncExternalStore(subscribeTimeControls, timeControlsReady);
  const language = useSyncExternalStore(onTranslationChange, getTranslationVersion);
  const [, setRevision] = useState(0);
  const [values, setValues] = useState({ from: "", to: "" });
  useLayoutEffect(() => {
    const element = host.current;

    if (!element) return;

    const chips = new ChipShell(element, {
      icon: "hgi-clock-01",
      labelKey: "timepicker.timeLabel",
      width: 26 * 16,
      body,
      title: false, // the slider brings its own title row
      exclude: ".trs-bar-wrapper", // the bar, handles and Now badge track the pointer
      deformFrom: ".trs-title",
      onBuild(chip) {
        const value = chip.trigger.querySelector<HTMLElement>(".lg-chip__value")!;

        value.classList.add("trc-value");
        setValueEl(value);
      },
      // The slider had no layout while its panel was hidden.
      onShow: () => renderSlider.current?.(),
    });

    shell.current = chips;

    const integration = Object.assign(element, {
      setDocked: (docked: boolean) => chips.setDocked(docked),
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
    window.addEventListener("resize", () => renderSlider.current?.(), { signal: events.signal });

    return () => {
      events.abort();
      chips.destroy();
      shell.current = null;
      setValueEl(null);
      integration.setDocked = () => {};

      integration.retranslate = () => {};
    };
  }, [body]);
  useLayoutEffect(() => {
    shell.current?.retranslate();
    setValues({
      from: formatTime(from.current?.value ?? ""),
      to: formatTime(to.current?.value ?? ""),
    });
    // The slider's own title is React-rendered, so it follows the language itself.
  }, [ready, language, valueEl]);

  return (
    <time-range-chip-picker ref={host} data-loading={ready ? undefined : ""} data-react-owned="">
      <TimePickerBackdrop />
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
      {valueEl &&
        createPortal(
          <>
            <span className="chip-skeleton trc-skeleton" aria-hidden="true" />
            <span>{values.from}</span>
            <span className="trc-value__sep" aria-hidden="true">
              –
            </span>
            <span>{values.to}</span>
          </>,
          valueEl,
        )}
      {createPortal(
        ready && fromInput && toInput ? (
          <TimeRangeSlider fromInput={fromInput} toInput={toInput} renderRef={renderSlider} />
        ) : null,
        body,
      )}
    </time-range-chip-picker>
  );
}
