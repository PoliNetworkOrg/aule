import { useEffect, useRef, useState, type CSSProperties } from "react";

type PositionStyle = CSSProperties & { "--pos": string };

type DaysStyle = CSSProperties & { "--days": number };

import { hasOpeningHours, romeMinutesOfDay } from "../available-rooms-script";
import { t, tf, useLocale } from "../i18n";
import { availableDates, roomDay } from "../state/availability";
import { buildAgenda, type AgendaItem } from "../state/agenda";
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
import { cn } from "../../lib/cn";
import { Icon } from "../ui/icon";
import { Tag } from "../ui/tag";
import { titleCase } from "../ui/text";
import { ProfessorList } from "../home/professor-link";
import { dateColumns, dateDay, dateNumber, dateWeekday } from "../home/when-controls";

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

/** Day overview: one bar for 07:15–20:15, labels every two hours so they never collide. */
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
    <div className="relative" aria-hidden="true">
      <div className="relative h-8 overflow-hidden rounded-sm border border-free-border bg-free-soft">
        {TICKS.map((hour) => (
          <span
            key={hour}
            className="absolute inset-y-0 w-px bg-foreground/10"
            style={{ left: percentOf(hour * 60) }}
          />
        ))}
        {searchWindow && (
          <span
            // Concentric with the bar, which it's inset 2px into.
            className="absolute inset-y-0.5 z-1 rounded-[calc(var(--radius-sm)-2px)] border-2 border-accent bg-accent/12"
            style={{
              left: percent(searchWindow.from),
              width: `calc(${percent(searchWindow.to)} - ${percent(searchWindow.from)})`,
            }}
          />
        )}
        {items.map((item, index) =>
          item.kind === "free" ? null : (
            <span
              key={`${index}-${item.start}-${item.end}`}
              className={cn(
                "absolute inset-y-0",
                item.kind === "closed"
                  ? "bg-[repeating-linear-gradient(135deg,var(--color-surface-muted)_0_4px,color-mix(in_srgb,var(--color-neutral)_30%,var(--color-surface-muted))_4px_6px)]"
                  : item.slot.category === "EXAM"
                    ? "border-x border-surface bg-[color-mix(in_srgb,var(--color-exam)_24%,var(--color-surface))] shadow-[inset_0_-3px_0_var(--color-exam)]"
                    : "border-x border-surface bg-[color-mix(in_srgb,var(--color-busy)_24%,var(--color-surface))] shadow-[inset_0_-3px_0_var(--color-busy)]",
              )}
              style={{
                left: percent(item.start),
                width: `calc(${percent(item.end)} - ${percent(item.start)})`,
              }}
            />
          ),
        )}
        {nowMinutes !== null && (
          <span
            className="absolute inset-y-0 z-2 -ml-px w-0.5 bg-accent"
            style={{ left: percentOf(nowMinutes) }}
          />
        )}
      </div>
      <div className="relative mt-1 h-[18px]">
        {TICKS.map((hour) => (
          <span
            key={hour}
            className="absolute left-(--pos) -translate-x-1/2 text-12 text-subtle tabular-nums last:-translate-x-[85%]"
            style={tickStyle(hour)}
          >
            {hour}
            {/* Narrow phones: "18:00 20:00" no longer fit side by side. */}
            <span className="max-2xs:hidden">:00</span>
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

  // Waits a frame: opening a room scrolls to the top (ClassroomPage and the
  // router both do, after this child effect), which would undo the scroll.
  // An explicit "smooth" overrides the CSS reduced-motion rule, so check it here.
  useEffect(() => {
    if (!highlighted) return;

    const frame = requestAnimationFrame(() => {
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

      row.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    });

    return () => cancelAnimationFrame(frame);
  }, [highlighted]);

  const title = "flex flex-wrap items-center gap-1.5 leading-[1.3] font-semibold";

  return (
    <li
      ref={row}
      className={cn(
        "grid grid-cols-[104px_minmax(0,1fr)] gap-3 rounded-md border border-l-4 border-border px-3 py-2.5",
        "max-xs:grid-cols-[92px_minmax(0,1fr)] max-xs:gap-2.5 max-xs:px-2.5",
        item.kind === "busy" && "border-l-busy",
        // Free and closed intervals are tinted bands, only their left edge drawn.
        item.kind === "free" && "border-transparent border-l-free bg-free-soft py-1.5",
        item.kind === "closed" && "border-transparent border-l-neutral bg-surface-muted py-1.5",
        inWindow &&
          "bg-[linear-gradient(var(--color-accent-soft),var(--color-accent-soft))] shadow-[inset_0_0_0_1px_var(--color-accent-soft-border)]",
        highlighted && "border-accent shadow-[0_0_0_3px_var(--color-focus-ring)]",
      )}
    >
      <div className="flex flex-col tabular-nums">
        <span className="text-15 font-bold whitespace-nowrap max-xs:text-14">
          {formatRange(item.start, item.end)}
        </span>
        <span className="text-12 text-muted">{duration}</span>
      </div>
      <div className="relative flex min-w-0 flex-col gap-0.5">
        {item.kind === "free" ? (
          <p className={cn(title, "text-free")}>{t("schedule.free")}</p>
        ) : item.kind === "closed" ? (
          <p className={cn(title, "text-muted")}>{t("schedule.closed")}</p>
        ) : (
          <>
            <p className={title}>
              {titleCase(slotTitle(item.slot), locale) || t("schedule.occupied")}
              {item.slot.category === "EXAM" && <Tag tone="exam">{t("schedule.exam")}</Tag>}
            </p>
            <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-13 text-muted [&_span]:inline-flex [&_span]:items-center [&_span]:gap-1">
              {item.slot.professors?.length ? (
                <span>
                  <Icon name="user-multiple" />
                  <span>
                    <ProfessorList names={item.slot.professors} />
                  </span>
                </span>
              ) : null}
              {item.slot.code != null && <span>{item.slot.code}</span>}
              {item.slot.section && <span>{item.slot.section}</span>}
            </p>
          </>
        )}
        {current && (
          <Tag tone="now" className="mt-1 self-start">
            {t("schedule.now")}
          </Tag>
        )}
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
      <p className="text-muted">
        {status === "loading" ? t("schedule.loading") : t("schedule.noData")}
      </p>
    );

  const { occupancy, opening } = roomDay(roomId, day) ?? { occupancy: [], opening: null };
  // Null occupancy: no source had this room's schedule that day. Say so rather
  // than draw an empty, free-looking day, unless the building is shut anyway.
  const unknown = !occupancy && !opening?.closed;
  const items = unknown ? [] : buildAgenda(occupancy ?? [], opening);
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
  const closedTime = items.some((item) => item.kind === "closed");

  const noLessonsKey = !closedTime
    ? "schedule.allDayFree"
    : items.every((item) => item.kind === "closed")
      ? "schedule.closedAllDay"
      : "schedule.freeWhenOpen";

  const daysStyle: DaysStyle = { "--days": dates.length };

  return (
    <div className="flex flex-col gap-3.5" data-revision={revision}>
      {/* Same day picker as the home "When" panel. */}
      <div className={dateColumns} style={daysStyle} role="group" aria-label={t("schedule.days")}>
        {dates.map((date) => {
          return (
            <button
              key={date}
              type="button"
              aria-pressed={date === day}
              className={dateDay}
              onClick={() => setSelected(date)}
            >
              <span className={dateWeekday}>
                {date === today
                  ? t("when.today")
                  : capitalise(weekday.format(parseIsoDate(date)).replace(/\.$/, ""), locale)}
              </span>
              <span className={dateNumber}>{parseIsoDate(date).getDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-18 font-bold">
            {capitalise(longDay.format(parseIsoDate(day)), locale)}
          </h3>
          <span className="text-13 text-muted">
            {unknown
              ? t("schedule.unknown")
              : lessons
                ? tf(lessons === 1 ? "schedule.oneEvent" : "schedule.events", { n: lessons })
                : t(noLessonsKey)}
          </span>
        </div>
        {!unknown && !hasOpeningHours() && (
          <p className="mt-2 flex items-start gap-1.5 text-13 text-partial">
            <Icon name="alert-02" />
            {t("schedule.hoursUnavailable")}
          </p>
        )}
        {unknown ? (
          <p className="flex items-start gap-2 rounded-md bg-surface-muted px-3 py-2.5 text-14 text-muted">
            <Icon name="calendar-remove-01" />
            {t("schedule.unknownNote")}
          </p>
        ) : (
          <DayTimeline items={items} searchWindow={searchWindow} nowMinutes={nowInDay} />
        )}
        {!unknown && searchWindow && (
          <p className="flex items-center gap-1.5 text-13 text-muted">
            <span
              className="h-2.5 w-3.5 rounded-[calc(var(--radius-sm)/2)] border-[1.5px] border-accent bg-accent-soft"
              aria-hidden="true"
            />
            {tf(context?.highlight ? "schedule.selected" : "schedule.yourWindow", {
              range: formatRange(searchWindow.from, searchWindow.to),
            })}
          </p>
        )}
        {/* Agenda: every interval of the day with its explicit start–end time. */}
        <ol className="flex flex-col gap-1.5">
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
