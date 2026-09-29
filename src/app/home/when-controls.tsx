import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { romeMinutesOfDay } from "../available-rooms-script";
import { LOCALES, t, translate, useLocale, type Locale } from "../i18n";
import { availableDates } from "../state/availability";
import { setDate, setState, setWindow, useStore } from "../state/store";
import {
  capitalise,
  DAY_END,
  DAY_START,
  defaultWindow,
  formatDuration,
  formatTime,
  fromMinutes,
  parseIsoDate,
  romeTodayIso,
  STEP_MINUTES,
  TIME_OPTIONS,
  toMinutes,
} from "../state/time";
import { Icon } from "../ui/icon";
import { Popup } from "../ui/popup";
import { Stable, StableText } from "../ui/stable";

type DaysStyle = CSSProperties & { "--days": number };

const TOTAL = DAY_END - DAY_START;

const SLIDER_TICKS = [8, 10, 12, 14, 16, 18, 20];

const KEY_STEPS = new Map([
  ["ArrowLeft", -STEP_MINUTES],
  ["ArrowDown", -STEP_MINUTES],
  ["ArrowRight", STEP_MINUTES],
  ["ArrowUp", STEP_MINUTES],
  ["PageDown", -60],
  ["PageUp", 60],
]);

function shortWeekday(locale: Locale, date: Date) {
  const text = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);

  return capitalise(text.replace(/\.$/, ""), locale);
}

function monthName(locale: Locale, date: Date) {
  return capitalise(new Intl.DateTimeFormat(locale, { month: "long" }).format(date), locale);
}

// ---------- Day ----------

export function DateStrip() {
  const locale = useLocale();
  const selected = useStore((state) => state.date);
  const status = useStore((state) => state.occupancy);

  useStore((state) => state.dataRevision);

  const dates = availableDates();
  const today = romeTodayIso();
  const current = LOCALES.indexOf(locale);

  if (!dates.length)
    return (
      <div className="date-strip" aria-busy={status === "loading"}>
        <div className="date-strip__days">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className="date-strip__skeleton" />
          ))}
        </div>
      </div>
    );

  const days = dates.map((date) => parseIsoDate(date));
  const style: DaysStyle = { "--days": dates.length };

  return (
    <div className="date-strip" style={style}>
      <div className="date-strip__months" aria-hidden="true">
        {days.map((day, index) =>
          index === 0 || days[index - 1].getMonth() !== day.getMonth() ? (
            <span
              key={dates[index]}
              className="date-strip__month"
              style={{ gridColumnStart: index + 1 }}
            >
              <Stable
                variants={LOCALES.map((variant) => monthName(variant, day))}
                current={current}
              />
            </span>
          ) : null,
        )}
      </div>
      <div className="date-strip__days" role="group" aria-label={t("when.day")}>
        {dates.map((date, index) => {
          const day = days[index];

          return (
            <button
              key={date}
              type="button"
              aria-pressed={date === selected}
              aria-label={new Intl.DateTimeFormat(locale, {
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(day)}
              className="date-strip__day"
              onClick={() => setDate(date)}
            >
              <span className="date-strip__weekday">
                <Stable
                  variants={LOCALES.map((variant) =>
                    date === today ? translate(variant, "when.today") : shortWeekday(variant, day),
                  )}
                  current={current}
                />
              </span>
              <span className="date-strip__number">{day.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Time ----------

function TimePickerButton({
  field,
  value,
  after,
  onChange,
}: {
  field: "from" | "to";
  value: string;
  /** Only offer times after this one (the end must follow the start). */
  after?: string;
  onChange: (value: string) => void;
}) {
  useLocale();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const options = (field === "from" ? TIME_OPTIONS.slice(0, -1) : TIME_OPTIONS.slice(1)).filter(
    (option) => !after || option > after,
  );

  const key = field === "from" ? "when.from" : "when.to";

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="time-value"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t(key)} ${formatTime(value)}`}
        onClick={() => setOpen(!open)}
      >
        <span className="time-value__label">
          <StableText k={key} />
        </span>
        <span className="time-value__time">{formatTime(value)}</span>
      </button>
      <Popup open={open} anchor={trigger} title={t(key)} onClose={close} minWidth={288}>
        <div className="time-grid">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="time-grid__option"
              aria-pressed={option === value}
              onClick={() => {
                onChange(option);
                close();
              }}
            >
              {formatTime(option)}
            </button>
          ))}
        </div>
      </Popup>
    </>
  );
}

type DragMode = "from" | "to" | "move";

function snap(minutes: number) {
  return Math.round(minutes / STEP_MINUTES) * STEP_MINUTES;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function percentOf(minutes: number) {
  return `${((clamp(minutes, DAY_START, DAY_END) - DAY_START) / TOTAL) * 100}%`;
}

/** Drag either end, or the whole range, across the 07:15–20:15 day. */
function RangeSlider() {
  useLocale();
  const from = toMinutes(useStore((state) => state.from));
  const to = toMinutes(useStore((state) => state.to));
  const date = useStore((state) => state.date);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: DragMode; offset: number } | null>(null);
  const [dragging, setDragging] = useState<DragMode | null>(null);
  const [now, setNow] = useState(romeMinutesOfDay);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(romeMinutesOfDay()), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  function minutesAt(clientX: number) {
    const rect = track.current!.getBoundingClientRect();

    return DAY_START + clamp((clientX - rect.left) / rect.width, 0, 1) * TOTAL;
  }

  function apply(mode: DragMode, minutes: number, offset = 0) {
    if (mode === "from") {
      setState({ from: fromMinutes(clamp(snap(minutes), DAY_START, to - STEP_MINUTES)) });
    } else if (mode === "to") {
      setState({ to: fromMinutes(clamp(snap(minutes), from + STEP_MINUTES, DAY_END)) });
    } else {
      const length = to - from;
      const start = clamp(snap(minutes - offset), DAY_START, DAY_END - length);

      setState({ from: fromMinutes(start), to: fromMinutes(start + length) });
    }
  }

  function start(event: ReactPointerEvent<HTMLElement>, mode: DragMode | null) {
    if (event.button !== 0 || !track.current) return;

    const minutes = minutesAt(event.clientX);

    const chosen: DragMode =
      mode ?? (Math.abs(minutes - from) <= Math.abs(minutes - to) ? "from" : "to");

    event.preventDefault();
    event.stopPropagation();
    track.current.setPointerCapture(event.pointerId);
    drag.current = { mode: chosen, offset: chosen === "move" ? minutes - from : 0 };
    setDragging(chosen);

    if (!mode) apply(chosen, minutes);
  }

  function move(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current) return;

    apply(drag.current.mode, minutesAt(event.clientX), drag.current.offset);
  }

  function end() {
    drag.current = null;
    setDragging(null);
  }

  function onKey(mode: "from" | "to", event: ReactKeyboardEvent) {
    const value = mode === "from" ? from : to;
    const step = KEY_STEPS.get(event.key);

    if (event.key === "Home") apply(mode, DAY_START);
    else if (event.key === "End") apply(mode, DAY_END);
    else if (step !== undefined) apply(mode, value + step);
    else return;

    event.preventDefault();
  }

  const showNow = date === romeTodayIso() && now > DAY_START && now < DAY_END;

  return (
    <div className={`range${dragging ? " range--dragging" : ""}`}>
      <div
        ref={track}
        className="range__track"
        onPointerDown={(event) => start(event, null)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {SLIDER_TICKS.map((hour) => (
          <span key={hour} className="range__gridline" style={{ left: percentOf(hour * 60) }} />
        ))}
        {showNow && <span className="range__now" style={{ left: percentOf(now) }} />}
        <div
          className="range__selection"
          style={{ left: percentOf(from), width: `calc(${percentOf(to)} - ${percentOf(from)})` }}
          onPointerDown={(event) => start(event, "move")}
        />
        {(["from", "to"] as const).map((mode) => {
          const value = mode === "from" ? from : to;

          return (
            <span
              key={mode}
              className="range__handle"
              style={{ left: percentOf(value) }}
              role="slider"
              tabIndex={0}
              aria-label={t(mode === "from" ? "when.from" : "when.to")}
              aria-valuemin={DAY_START}
              aria-valuemax={DAY_END}
              aria-valuenow={value}
              aria-valuetext={formatTime(fromMinutes(value))}
              onPointerDown={(event) => start(event, mode)}
              onKeyDown={(event) => onKey(mode, event)}
            />
          );
        })}
      </div>
      <div className="range__ticks" aria-hidden="true">
        {SLIDER_TICKS.map((hour) => (
          <span key={hour} className="range__tick" style={{ left: percentOf(hour * 60) }}>
            {hour}
          </span>
        ))}
      </div>
    </div>
  );
}

export function TimeRange() {
  useLocale();
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const date = useStore((state) => state.date);

  useStore((state) => state.dataRevision);

  const today = romeTodayIso();
  const now = defaultWindow(false);
  const isNow = date === today && from === now.from;
  const hasToday = availableDates().includes(today);

  return (
    <div className="time-range">
      <div className="time-range__row">
        <TimePickerButton
          field="from"
          value={from}
          onChange={(value) => setWindow(value, to, "from")}
        />
        <Icon name="arrow-right-02" className="time-range__arrow" />
        <TimePickerButton
          field="to"
          value={to}
          after={from}
          onChange={(value) => setWindow(from, value, "to")}
        />
        <span className="time-range__duration">
          {formatDuration(toMinutes(to) - toMinutes(from))}
        </span>
        <button
          type="button"
          className="chip time-range__now"
          aria-pressed={isNow}
          disabled={!hasToday}
          onClick={() => setState({ date: today, ...now })}
        >
          <Icon name="clock-01" />
          <StableText k="when.now" />
        </button>
      </div>
      <RangeSlider />
    </div>
  );
}
