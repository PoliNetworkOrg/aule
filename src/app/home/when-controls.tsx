import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "../../lib/cn";
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
import { centreStable, insetFocus } from "../ui/focus";
import { pressable } from "../ui/motion";
import { Icon } from "../ui/icon";
import { Panel, PanelHeader, PanelTitle } from "../ui/panel";
import { Popup } from "../ui/popup";
import { Stable, StableText } from "../ui/stable";
import { hiddenByMoreFilters } from "./filters";

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

/** One column per available day (`--days`, set on the strip), for months and days alike. */
export const dateColumns = "grid grid-cols-[repeat(var(--days,6),minmax(0,1fr))] gap-1.5";

/** A day of the strip (an aria-pressed button); the room schedule picks its day with these too. */
export const dateDay = cn(
  "group flex h-11.5 flex-col items-center justify-center gap-px rounded-md bg-surface-muted leading-[1.1]",
  "transition-[background-color,color,scale] hover:bg-accent-soft aria-pressed:bg-accent aria-pressed:text-on-accent",
  pressable,
  insetFocus,
);

/** The weekday above a day's number, dimmed unless the day is picked. */
export const dateWeekday = cn(
  "text-11 font-semibold text-muted",
  "group-aria-pressed:text-inherit group-aria-pressed:opacity-85",
  centreStable,
);

export const dateNumber = "text-16 font-bold tabular-nums";

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
      <div className="grid gap-1" aria-busy={status === "loading"}>
        <div className={dateColumns}>
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className="h-11.5 rounded-md bg-surface-muted" />
          ))}
        </div>
      </div>
    );

  const days = dates.map((date) => parseIsoDate(date));
  const style: DaysStyle = { "--days": dates.length };

  // Columns each month spans, keyed by its first day's index.
  const spans = new Map<number, number>();

  days.forEach((day, index) => {
    if (index > 0 && days[index - 1].getMonth() === day.getMonth()) return;

    const rest = days.slice(index).findIndex((next) => next.getMonth() !== day.getMonth());

    spans.set(index, rest === -1 ? days.length - index : rest);
  });

  // A month shown for a single day (e.g. today is the 30th) gets one column,
  // too narrow for "Settembre": abbreviate it, and its neighbour too so the
  // row never mixes "Sep" with "October".
  const format = [...spans.values()].includes(1) ? "short" : "long";

  return (
    <div className="grid gap-1" style={style}>
      <div className={cn(dateColumns, "min-h-4")} aria-hidden="true">
        {days.map((day, index) => {
          const span = spans.get(index);

          if (span === undefined) return null;

          return (
            <span
              key={dates[index]}
              className="row-start-1 text-11 font-bold tracking-widest whitespace-nowrap text-muted uppercase"
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
      <div className={dateColumns} role="group" aria-label={t("when.day")}>
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
              className={dateDay}
              onClick={() => setDate(date)}
            >
              <span className={dateWeekday}>
                <Stable
                  variants={LOCALES.map((variant) =>
                    date === today ? translate(variant, "when.today") : shortWeekday(variant, day),
                  )}
                  current={current}
                />
              </span>
              <span className={dateNumber}>{day.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Time ----------

/** The earlier/later buttons of the time picker. */
const adjustButton =
  "grid h-11.5 w-12 place-items-center text-18 text-accent-strong disabled:text-subtle disabled:opacity-45";

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
        className={cn(
          // Shares the row with the stepper instead of leaving a gap before it.
          "relative flex h-11.5 min-w-0 flex-[1_1_90px] flex-col items-start justify-center rounded-md border border-border-strong bg-surface px-2.5",
          "transition-[border-color] select-none hover:border-accent aria-expanded:border-accent",
          // Mice and pens can drag it sideways to change the time.
          "pointer-fine:cursor-ew-resize max-3xs:h-13 max-3xs:w-full",
        )}
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
        <span className="text-10 leading-[1.2] font-bold tracking-widest text-subtle uppercase">
          <StableText k={key} />
        </span>
        <span className="text-18 leading-[1.2] font-bold tabular-nums">{formatTime(value)}</span>
        <Icon
          name="arrow-down-01"
          className="absolute right-1.75 bottom-2.25 text-12 text-subtle"
        />
      </button>
      <Popup open={open} anchor={trigger} title={t(key)} onClose={close} minWidth={288}>
        <div className="grid gap-3">
          <div
            className="flex h-12 items-center justify-between rounded-md border border-border bg-surface-muted"
            role="group"
            aria-label={t(key)}
          >
            <button
              type="button"
              className={adjustButton}
              aria-label={t("when.earlier")}
              disabled={toMinutes(value) <= min}
              onClick={() => changeBy(-1)}
            >
              <Icon name="remove-01" />
            </button>
            <strong className="text-20 tabular-nums">{formatTime(value)}</strong>
            <button
              type="button"
              className={adjustButton}
              aria-label={t("when.later")}
              disabled={toMinutes(value) >= max}
              onClick={() => changeBy(1)}
            >
              <Icon name="add-01" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {visibleOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={cn(
                  "min-h-11 rounded-sm bg-surface-muted text-15 font-semibold tabular-nums transition-[background-color,color,scale]",
                  pressable,
                  "hover:bg-accent-soft hover:text-accent-strong aria-pressed:bg-accent aria-pressed:text-on-accent",
                  insetFocus,
                )}
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

const sliderFocus =
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

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
  const pointerMode = dragging ?? hover;

  const handles: { mode: DragMode; value: number; label: string }[] = [
    { mode: "from", value: from, label: t("when.from") },
    { mode: "to", value: to, label: t("when.to") },
  ];

  return (
    <div className="select-none">
      <div
        ref={track}
        className={cn(
          "relative h-9 touch-none rounded-md bg-surface-muted",
          // The cursor shows what a press would do: resize, move or jump.
          pointerMode === "jump"
            ? "cursor-pointer"
            : pointerMode === "move"
              ? dragging
                ? "cursor-grabbing"
                : "cursor-grab"
              : "cursor-ew-resize",
        )}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={() => setHover("jump")}
      >
        {SLIDER_TICKS.map((hour) => (
          <span
            key={hour}
            className="absolute top-3 bottom-3 w-px bg-border-strong"
            style={{ left: percentOf(hour * 60) }}
          />
        ))}
        {showNow && (
          <span
            className="pointer-events-none absolute -top-1 -bottom-1 z-2 -ml-px w-0.5 rounded-[1px] bg-accent"
            style={{ left: percentOf(now) }}
          />
        )}
        <span
          className={cn(
            // Concentric with the track it sits in.
            "absolute top-1 bottom-1 z-1 min-w-1 rounded-[calc(var(--radius-md)-3px)] shadow-[inset_0_0_0_1.5px_var(--color-accent)]",
            "bg-[color-mix(in_srgb,var(--color-accent)_28%,var(--color-surface))]",
            sliderFocus,
          )}
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
            className={cn(
              "pointer-events-none absolute top-1/2 z-3 size-5.5 -translate-1/2 rounded-full border-2 border-accent bg-surface shadow-sm",
              // Filled while it's being dragged.
              dragging === mode && "bg-accent",
              sliderFocus,
            )}
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
      <div className="relative mt-1 h-4" aria-hidden="true">
        {SLIDER_TICKS.map((hour) => (
          <span
            key={hour}
            className="absolute -translate-x-1/2 text-11 text-muted tabular-nums"
            style={{ left: percentOf(hour * 60) }}
          >
            {hour}
          </span>
        ))}
      </div>
    </div>
  );
}

const stepperButton = cn(
  "grid h-full w-8.5 place-items-center text-16 text-muted transition-[background-color,color] first:rounded-l-md last:rounded-r-md disabled:opacity-35",
  "hover:not-disabled:bg-accent-soft hover:not-disabled:text-accent-strong",
);

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
    <div
      className={cn(
        "ml-1 inline-flex h-11.5 flex-none items-center rounded-md border border-border-strong bg-surface",
        // Narrow phones: a full row under the two times.
        "max-3xs:col-span-full max-3xs:ml-0 max-3xs:h-10 max-3xs:justify-between",
      )}
      role="group"
      aria-label={t("when.duration")}
    >
      <button
        type="button"
        className={stepperButton}
        aria-label={t("when.shorter")}
        disabled={length <= DURATION_STEP}
        onClick={() => setDuration(shorter)}
      >
        <Icon name="remove-01" />
      </button>
      <span className="min-w-14 text-center text-14 font-bold tabular-nums" aria-live="polite">
        {formatDuration(length)}
      </span>
      <button
        type="button"
        className={stepperButton}
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
      // Highlighted while the window starts now.
      className={cn(
        "inline-flex h-7.5 items-center gap-1.5 rounded-full border border-border bg-surface pr-3 pl-2.5",
        "text-13 leading-none font-semibold text-muted icon:text-15 disabled:opacity-45",
        "transition-[background-color,border-color,color] hover:not-disabled:border-accent hover:not-disabled:text-accent-strong",
        "aria-pressed:border-accent-soft-border aria-pressed:bg-accent-soft aria-pressed:text-accent-strong",
      )}
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
      {t("when.now")}
    </button>
  );
}

export function WhenPanel() {
  useLocale();
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);

  return (
    <Panel
      // Divided from the panel above.
      className={cn("border-t border-t-border pt-3", hiddenByMoreFilters)}
      aria-labelledby="when-title"
    >
      <PanelHeader>
        <PanelTitle id="when-title">
          <Icon name="calendar-03" />
          {t("when.title")}
        </PanelTitle>
        <NowButton />
      </PanelHeader>
      <DateStrip />
      <div className="mt-2 flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5 max-3xs:grid max-3xs:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <TimePickerButton
            field="from"
            value={from}
            onChange={(value) => setWindow(value, to, "from")}
          />
          <Icon name="arrow-right-02" className="text-18 text-subtle" />
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
    </Panel>
  );
}
