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
import { readState, setDate, setDuration, setState, setWindow, useStore } from "../state/store";
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

function monthName(locale: Locale, date: Date, month: "long" | "short" = "long") {
  const text = new Intl.DateTimeFormat(locale, { month }).format(date);

  return capitalise(text.replace(/\.$/, ""), locale);
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
        {days.map((day, index) => {
          if (index > 0 && days[index - 1].getMonth() === day.getMonth()) return null;

          // A month shown for a single day (e.g. today is the 30th) gets one
          // column, too narrow for "Settembre": abbreviate it instead of overlapping.
          const rest = days.slice(index).findIndex((next) => next.getMonth() !== day.getMonth());
          const span = rest === -1 ? days.length - index : rest;
          const format = span === 1 ? "short" : "long";

          return (
            <span
              key={dates[index]}
              className="date-strip__month"
              style={{ gridColumn: `${index + 1} / span ${span}` }}
            >
              <Stable
                variants={LOCALES.map((variant) => monthName(variant, day, format))}
                current={current}
              />
            </span>
          );
        })}
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

  const gesture = useRef<{ pointerId: number; x: number; minutes: number; moved: boolean } | null>(
    null,
  );

  const suppressClick = useRef(false);
  const close = useCallback(() => setOpen(false), []);

  const options = (field === "from" ? TIME_OPTIONS.slice(0, -1) : TIME_OPTIONS.slice(1)).filter(
    (option) => !after || option > after,
  );

  const visibleOptions = options.filter((option) => option.endsWith(":15") || option === value);

  const key = field === "from" ? "when.from" : "when.to";
  const min = field === "to" && after ? toMinutes(after) + STEP_MINUTES : DAY_START;
  const max = field === "from" ? DAY_END - STEP_MINUTES : DAY_END;

  function changeBy(steps: number, origin = toMinutes(value)) {
    const next = fromMinutes(clamp(origin + steps * STEP_MINUTES, min, max));

    if (next !== readState()[field]) onChange(next);
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="time-value"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t(key)} ${formatTime(value)}`}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;

            return;
          }

          setOpen(!open);
        }}
        onPointerDown={(event) => {
          suppressClick.current = false;

          if ((event.pointerType !== "mouse" && event.pointerType !== "pen") || event.button !== 0)
            return;

          gesture.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            minutes: toMinutes(value),
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = gesture.current;

          if (!drag || event.pointerId !== drag.pointerId) return;

          const steps = Math.round((event.clientX - drag.x) / 28);

          if (steps === 0 && !drag.moved) return;

          if (steps !== 0) drag.moved = true;

          changeBy(steps, drag.minutes);
        }}
        onPointerUp={(event) => {
          if (gesture.current?.pointerId !== event.pointerId) return;

          suppressClick.current = gesture.current.moved;
          gesture.current = null;
        }}
        onPointerCancel={() => {
          gesture.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

          event.preventDefault();
          changeBy(event.key === "ArrowRight" ? 1 : -1);
        }}
      >
        <span className="time-value__label">
          <StableText k={key} />
        </span>
        <span className="time-value__time">{formatTime(value)}</span>
        <Icon name="arrow-down-01" className="time-value__chevron" />
      </button>
      <Popup open={open} anchor={trigger} title={t(key)} onClose={close} minWidth={288}>
        <div className="time-picker">
          <div className="time-picker__adjust" role="group" aria-label={t(key)}>
            <button
              type="button"
              aria-label={t("when.earlier")}
              disabled={toMinutes(value) <= min}
              onClick={() => changeBy(-1)}
            >
              <Icon name="remove-01" />
            </button>
            <strong>{formatTime(value)}</strong>
            <button
              type="button"
              aria-label={t("when.later")}
              disabled={toMinutes(value) >= max}
              onClick={() => changeBy(1)}
            >
              <Icon name="add-01" />
            </button>
          </div>
          <div className="time-grid">
            {visibleOptions.map((option) => (
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
        </div>
      </Popup>
    </>
  );
}

type DragMode = "from" | "to" | "move";

const DURATION_STEP = 30;

function snap(minutes: number) {
  return Math.round(minutes / STEP_MINUTES) * STEP_MINUTES;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function percentOf(minutes: number) {
  return `${((clamp(minutes, DAY_START, DAY_END) - DAY_START) / TOTAL) * 100}%`;
}

/**
 * Which part of the slider a pointer at `x` grabs. Edges resize, the inside
 * moves the window; a short window is moved from anywhere near its centre so
 * it never gets stuck between its own handles; elsewhere the window jumps there.
 */
function hitTest(x: number, fromX: number, toX: number): DragMode | "jump" {
  const width = toX - fromX;
  const edge = Math.min(10, width / 4);

  if (width < 32 && Math.abs(x - (fromX + toX) / 2) <= 12) return "move";

  if (x >= fromX - 18 && x < fromX + edge) return "from";

  if (x > toX - edge && x <= toX + 18) return "to";

  return x > fromX && x < toX ? "move" : "jump";
}

/** Drag either end, or the whole window, across the 07:15–20:15 day. */
function RangeSlider() {
  useLocale();
  const from = toMinutes(useStore((state) => state.from));
  const to = toMinutes(useStore((state) => state.to));
  const date = useStore((state) => state.date);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: DragMode; offset: number } | null>(null);
  const [dragging, setDragging] = useState<DragMode | null>(null);
  const [hover, setHover] = useState<DragMode | "jump">("jump");
  const [now, setNow] = useState(romeMinutesOfDay);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(romeMinutesOfDay()), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  function geometry() {
    const rect = track.current!.getBoundingClientRect();
    const toX = (minutes: number) => rect.left + ((minutes - DAY_START) / TOTAL) * rect.width;

    return { rect, fromX: toX(from), toX: toX(to) };
  }

  function minutesAt(clientX: number) {
    const { rect } = geometry();

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

  function start(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !track.current) return;

    const { fromX, toX } = geometry();
    const minutes = minutesAt(event.clientX);
    const hit = hitTest(event.clientX, fromX, toX);
    const length = to - from;

    event.preventDefault();
    track.current.setPointerCapture(event.pointerId);

    if (hit === "jump") {
      // Centre the window where the track was pressed, then keep dragging it.
      drag.current = { mode: "move", offset: length / 2 };
      apply("move", minutes, length / 2);
    } else {
      drag.current = { mode: hit, offset: hit === "move" ? minutes - from : 0 };
    }

    setDragging(drag.current.mode);
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) {
      // Hovering: show what a press here would do.
      if (event.pointerType === "mouse") {
        const { fromX, toX } = geometry();

        setHover(hitTest(event.clientX, fromX, toX));
      }

      return;
    }

    apply(drag.current.mode, minutesAt(event.clientX), drag.current.offset);
  }

  function end() {
    drag.current = null;
    setDragging(null);
  }

  function onKey(mode: DragMode, event: ReactKeyboardEvent) {
    const value = mode === "to" ? to : from;
    const step = KEY_STEPS.get(event.key);

    if (event.key === "Home") apply(mode, DAY_START);
    else if (event.key === "End") apply(mode, mode === "move" ? DAY_END - (to - from) : DAY_END);
    else if (step !== undefined) apply(mode, value + step);
    else return;

    event.preventDefault();
  }

  const showNow = date === romeTodayIso() && now > DAY_START && now < DAY_END;

  const handles: { mode: DragMode; value: number; label: string }[] = [
    { mode: "from", value: from, label: t("when.from") },
    { mode: "to", value: to, label: t("when.to") },
  ];

  return (
    <div className={`range range--${dragging ?? hover}${dragging ? " range--dragging" : ""}`}>
      <div
        ref={track}
        className="range__track"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={() => setHover("jump")}
      >
        {SLIDER_TICKS.map((hour) => (
          <span key={hour} className="range__gridline" style={{ left: percentOf(hour * 60) }} />
        ))}
        {showNow && <span className="range__now" style={{ left: percentOf(now) }} />}
        <span
          className="range__selection"
          style={{ left: percentOf(from), width: `calc(${percentOf(to)} - ${percentOf(from)})` }}
          role="slider"
          tabIndex={0}
          aria-label={t("when.window")}
          aria-valuemin={DAY_START}
          aria-valuemax={DAY_END}
          aria-valuenow={from}
          aria-valuetext={`${formatTime(fromMinutes(from))}–${formatTime(fromMinutes(to))}`}
          onKeyDown={(event) => onKey("move", event)}
        />
        {handles.map(({ mode, value, label }) => (
          <span
            key={mode}
            className="range__handle"
            style={{ left: percentOf(value) }}
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-valuemin={DAY_START}
            aria-valuemax={DAY_END}
            aria-valuenow={value}
            aria-valuetext={formatTime(fromMinutes(value))}
            onKeyDown={(event) => onKey(mode, event)}
          />
        ))}
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

function DurationStepper() {
  useLocale();
  const from = toMinutes(useStore((state) => state.from));
  const to = toMinutes(useStore((state) => state.to));
  const length = to - from;

  const shorter = Math.max(
    DURATION_STEP,
    Math.ceil(length / DURATION_STEP) * DURATION_STEP - DURATION_STEP,
  );

  const longer = Math.floor(length / DURATION_STEP) * DURATION_STEP + DURATION_STEP;

  return (
    <div className="stepper" role="group" aria-label={t("when.duration")}>
      <button
        type="button"
        className="stepper__button"
        aria-label={t("when.shorter")}
        disabled={length <= DURATION_STEP}
        onClick={() => setDuration(shorter)}
      >
        <Icon name="remove-01" />
      </button>
      <span className="stepper__value" aria-live="polite">
        {formatDuration(length)}
      </span>
      <button
        type="button"
        className="stepper__button"
        aria-label={t("when.longer")}
        disabled={to >= DAY_END}
        onClick={() => setDuration(longer)}
      >
        <Icon name="add-01" />
      </button>
    </div>
  );
}

/** Jumps to today and the current time, keeping the chosen duration. */
function NowButton() {
  useLocale();
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const date = useStore((state) => state.date);

  useStore((state) => state.dataRevision);

  const today = romeTodayIso();
  const start = toMinutes(defaultWindow(false).from);
  const active = date === today && toMinutes(from) === start;
  const hasToday = availableDates().includes(today);

  return (
    <button
      type="button"
      className="now-button"
      aria-pressed={active}
      disabled={!hasToday}
      onClick={() => {
        const length = toMinutes(to) - toMinutes(from);
        const end = Math.min(start + length, DAY_END);

        setState({
          date: today,
          from: fromMinutes(start),
          to: fromMinutes(Math.max(end, start + STEP_MINUTES)),
        });
      }}
    >
      <Icon name="clock-01" />
      <StableText k="when.now" />
    </button>
  );
}

export function WhenPanel() {
  useLocale();
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);

  return (
    <section className="panel" aria-labelledby="when-title">
      <div className="panel__header">
        <h2 className="panel__title" id="when-title">
          <Icon name="calendar-03" />
          {t("when.title")}
        </h2>
        <NowButton />
      </div>
      <DateStrip />
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
          <DurationStepper />
        </div>
        <RangeSlider />
      </div>
    </section>
  );
}
