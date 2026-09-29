import { useEffect, useRef, useState, type CSSProperties } from "react";

type PositionStyle = CSSProperties & { "--pos": string };

import { romeMinutesOfDay } from "../available-rooms-script";
import { t, tf, useLocale } from "../i18n";
import { availableDates, roomOccupancy } from "../state/availability";
import type { ClassroomContext } from "../state/navigation-context";
import { useStore } from "../state/store";
import {
  capitalise,
  DAY_END,
  DAY_START,
  formatDuration,
  formatRange,
  fromMinutes,
  isAfterHours,
  parseIsoDate,
  romeTodayIso,
  toMinutes,
} from "../state/time";
import type { Occupation } from "../types";
import { Icon } from "../ui/icon";
import { titleCase } from "../ui/text";

type AgendaItem =
  | { kind: "busy"; start: string; end: string; slot: Occupation }
  | { kind: "free"; start: string; end: string };

const TICKS = [8, 10, 12, 14, 16, 18, 20];

const TOTAL = DAY_END - DAY_START;

function percentOf(minutes: number) {
  const clamped = Math.min(Math.max(minutes, DAY_START), DAY_END);

  return `${(((clamped - DAY_START) / TOTAL) * 100).toFixed(3)}%`;
}

function tickStyle(hour: number): PositionStyle {
  return { "--pos": percentOf(hour * 60) };
}

function percent(time: string) {
  return percentOf(toMinutes(time));
}

/** The day from DAY_START to DAY_END as alternating busy and free intervals. */
function buildAgenda(occupancy: Occupation[]) {
  const items: AgendaItem[] = [];
  let cursor = fromMinutes(DAY_START);

  const sorted = occupancy
    .filter((slot) => slot.inizio && slot.fine && slot.fine > slot.inizio)
    .sort((a, b) => a.inizio.localeCompare(b.inizio));

  for (const slot of sorted) {
    if (slot.inizio > cursor) items.push({ kind: "free", start: cursor, end: slot.inizio });

    items.push({ kind: "busy", start: slot.inizio, end: slot.fine, slot });

    if (slot.fine > cursor) cursor = slot.fine;
  }

  if (cursor < fromMinutes(DAY_END))
    items.push({ kind: "free", start: cursor, end: fromMinutes(DAY_END) });

  return items;
}

function slotTitle(slot: Occupation) {
  return (
    (slot.category === "COURSE" || slot.category === "EXAM" ? slot.course : slot.raw) ??
    slot.name ??
    ""
  );
}

function overlaps(item: { start: string; end: string }, from: string, to: string) {
  return item.start < to && item.end > from;
}

function DayTimeline({
  items,
  searchWindow,
  nowMinutes,
}: {
  items: AgendaItem[];
  searchWindow: { from: string; to: string } | null;
  nowMinutes: number | null;
}) {
  return (
    <div className="timeline" aria-hidden="true">
      <div className="timeline__bar">
        {TICKS.map((hour) => (
          <span key={hour} className="timeline__gridline" style={{ left: percentOf(hour * 60) }} />
        ))}
        {searchWindow && (
          <span
            className="timeline__window"
            style={{
              left: percent(searchWindow.from),
              width: `calc(${percent(searchWindow.to)} - ${percent(searchWindow.from)})`,
            }}
          />
        )}
        {items.map((item, index) =>
          item.kind === "busy" ? (
            <span
              key={`${index}-${item.start}-${item.end}`}
              className={`timeline__block${item.slot.category === "EXAM" ? " timeline__block--exam" : ""}`}
              style={{
                left: percent(item.start),
                width: `calc(${percent(item.end)} - ${percent(item.start)})`,
              }}
            />
          ) : null,
        )}
        {nowMinutes !== null && (
          <span className="timeline__now" style={{ left: percentOf(nowMinutes) }} />
        )}
      </div>
      <div className="timeline__ticks">
        {TICKS.map((hour) => (
          <span key={hour} className="timeline__tick" style={tickStyle(hour)}>
            {hour}:00
          </span>
        ))}
      </div>
    </div>
  );
}

function AgendaRow({
  item,
  inWindow,
  highlighted,
  current,
}: {
  item: AgendaItem;
  inWindow: boolean;
  highlighted: boolean;
  current: boolean;
}) {
  const locale = useLocale();
  const row = useRef<HTMLLIElement>(null);
  const duration = formatDuration(toMinutes(item.end) - toMinutes(item.start));

  useEffect(() => {
    if (highlighted) row.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlighted]);

  const classes = [
    "agenda__item",
    `agenda__item--${item.kind}`,
    inWindow ? "agenda__item--window" : "",
    highlighted ? "agenda__item--highlight" : "",
    current ? "agenda__item--current" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li ref={row} className={classes}>
      <div className="agenda__time">
        <span className="agenda__range">{formatRange(item.start, item.end)}</span>
        <span className="agenda__duration">{duration}</span>
      </div>
      <div className="agenda__body">
        {item.kind === "free" ? (
          <p className="agenda__title agenda__title--free">{t("schedule.free")}</p>
        ) : (
          <>
            <p className="agenda__title">
              {titleCase(slotTitle(item.slot), locale) || t("schedule.occupied")}
              {item.slot.category === "EXAM" && (
                <span className="tag tag--exam">{t("schedule.exam")}</span>
              )}
            </p>
            <p className="agenda__meta">
              {item.slot.professors?.length ? (
                <span>
                  <Icon name="user-multiple" />
                  {item.slot.professors.map((name) => titleCase(name, locale)).join(", ")}
                </span>
              ) : null}
              {item.slot.code != null && <span>{item.slot.code}</span>}
              {item.slot.section && <span>{item.slot.section}</span>}
            </p>
          </>
        )}
        {current && <span className="tag tag--now">{t("schedule.now")}</span>}
      </div>
    </li>
  );
}

export function Schedule({
  roomId,
  context,
}: {
  roomId: number;
  context: ClassroomContext | null;
}) {
  const locale = useLocale();
  const revision = useStore((state) => state.dataRevision);
  const status = useStore((state) => state.occupancy);
  const dates = availableDates();
  const today = romeTodayIso();
  const [nowMinutes, setNowMinutes] = useState(romeMinutesOfDay);

  const initial =
    (context && dates.includes(context.date) && context.date) ||
    (dates.includes(today) && !isAfterHours() ? today : dates.find((date) => date > today)) ||
    dates[0] ||
    "";

  const [selected, setSelected] = useState(initial);
  const day = dates.includes(selected) ? selected : initial;

  useEffect(() => {
    const timer = window.setInterval(() => setNowMinutes(romeMinutesOfDay()), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  if (!dates.length)
    return (
      <p className="schedule__empty">
        {status === "loading" ? t("schedule.loading") : t("schedule.noData")}
      </p>
    );

  const occupancy = roomOccupancy(roomId, day) ?? [];
  const items = buildAgenda(occupancy);
  const isToday = day === today;
  const nowInDay = isToday && nowMinutes >= DAY_START && nowMinutes <= DAY_END ? nowMinutes : null;

  const searchWindow =
    context && context.date === day ? { from: context.from, to: context.to } : null;

  const now = fromMinutes(nowMinutes);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });

  const longDay = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const lessons = items.filter((item) => item.kind === "busy").length;

  return (
    <div className="schedule" data-revision={revision}>
      <div className="day-tabs" role="group" aria-label={t("schedule.days")}>
        {dates.map((date) => {
          return (
            <button
              key={date}
              type="button"
              aria-pressed={date === day}
              className="day-tabs__tab"
              onClick={() => setSelected(date)}
            >
              <span className="day-tabs__weekday">
                {date === today
                  ? t("when.today")
                  : capitalise(weekday.format(parseIsoDate(date)).replace(/\.$/, ""), locale)}
              </span>
              <span className="day-tabs__number">{parseIsoDate(date).getDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="schedule__day">
        <div className="schedule__heading">
          <h3 className="schedule__date">
            {capitalise(longDay.format(parseIsoDate(day)), locale)}
          </h3>
          <span className="schedule__count">
            {lessons
              ? tf(lessons === 1 ? "schedule.oneEvent" : "schedule.events", { n: lessons })
              : t("schedule.allDayFree")}
          </span>
        </div>
        <DayTimeline items={items} searchWindow={searchWindow} nowMinutes={nowInDay} />
        {searchWindow && (
          <p className="schedule__legend">
            <span className="schedule__legend-swatch" aria-hidden="true" />
            {tf(context?.highlight ? "schedule.selected" : "schedule.yourWindow", {
              range: formatRange(searchWindow.from, searchWindow.to),
            })}
          </p>
        )}
        <ol className="agenda">
          {items.map((item, index) => (
            <AgendaRow
              key={`${index}-${item.kind}-${item.start}`}
              item={item}
              inWindow={
                !!searchWindow &&
                !context?.highlight &&
                overlaps(item, searchWindow.from, searchWindow.to)
              }
              highlighted={
                !!context?.highlight &&
                item.kind === "busy" &&
                context.date === day &&
                item.start === context.from &&
                item.end === context.to
              }
              current={isToday && item.start <= now && item.end > now}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}
