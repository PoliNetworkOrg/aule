import { useMemo } from "react";
import { cn } from "../../lib/cn";
import { t, tf, useLocale } from "../i18n";
import {
  OCC_MAX_GROUPS,
  runClassroomSearch,
  runOccupationSearch,
  SEARCH_MAX_RESULTS,
  tokenize,
  type OccupationGroup,
} from "../classroom-search-data";
import { findClassroom, roomWindowStatus } from "../state/availability";
import { openClassroom } from "../state/navigation-context";
import { setQuery, useStore } from "../state/store";
import { capitalise, formatRange, parseIsoDate } from "../state/time";
import { Highlight, titleCase } from "../ui/text";
import { SectionCount, SectionTitle } from "../ui/card";
import { Chip, ChipRow } from "../ui/chip";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { pressable } from "../ui/motion";
import { Tag } from "../ui/tag";
import { StatusTag } from "./room-card";
import { RoomThumbnail } from "./room-thumbnail";
import { ProfessorList } from "./professor-link";

function formatDay(iso: string, locale: string) {
  const text = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(parseIsoDate(iso));

  return capitalise(text, locale);
}

/**
 * Professors teaching the matching lessons: for a course query, who teaches it;
 * for a name, that professor first. Picking one searches for their timetable.
 */
function matchingProfessors(groups: OccupationGroup[], query: string) {
  const words = tokenize(query);
  const byName = new Set<string>();
  const others = new Set<string>();

  for (const group of groups)
    for (const professor of group.professors) {
      const lower = professor.toLowerCase();

      (words.every((word) => lower.includes(word)) ? byName : others).add(professor);
    }

  return [...byName, ...[...others].filter((name) => !byName.has(name))].slice(0, 10);
}

const searchSection = "flex flex-col gap-2.5";

const searchNote = "text-13 text-subtle";

const eventMetaItem = "inline-flex items-center gap-1";

function RoomResults({ query }: { query: string }) {
  useLocale();
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const rooms = runClassroomSearch(query);

  if (!rooms.visible.length) return null;

  return (
    <section className={searchSection}>
      <SectionTitle>
        {t("search.rooms")} <SectionCount>{rooms.total}</SectionCount>
      </SectionTitle>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
        {rooms.visible.map((room) => {
          const entry = findClassroom(room.id);
          const availability = date ? roomWindowStatus(room.id, date, from, to) : null;

          if (!entry) return null;

          return (
            <li key={room.id}>
              <button
                type="button"
                className={cn(
                  "group/room grid w-full grid-cols-[1fr_auto] items-center gap-x-2 rounded-md border border-border bg-surface px-3.5 py-3 text-left",
                  "transition-[border-color,scale] hover:border-accent-soft-border",
                  pressable,
                  "has-data-[slot=thumbnail]:grid-cols-[56px_minmax(0,1fr)_auto]",
                )}
                onClick={() =>
                  openClassroom(entry, date ? { date, from, to, highlight: false } : null)
                }
              >
                <RoomThumbnail
                  id={room.id}
                  idfoto={room.idfoto}
                  className="col-start-1 row-[1/3] size-14 rounded-sm"
                />
                <span className="text-16 font-bold group-has-data-[slot=thumbnail]/room:col-start-2">
                  <Highlight text={room.name} query={query} />
                </span>
                <span className="col-start-1 text-13 text-muted group-has-data-[slot=thumbnail]/room:col-start-2">
                  {t("building.prefix")} <Highlight text={room.buildingName} query={query} />
                  {room.buildingAltName ? ` · ${room.buildingAltName}` : ""} ·{" "}
                  <Highlight text={room.campusName} query={query} />
                </span>
                {availability && (
                  <StatusTag
                    status={availability.status}
                    slots={availability.slots}
                    compact
                    className="col-start-2 row-[1/3] group-has-data-[slot=thumbnail]/room:col-start-3"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {rooms.capped && (
        <p className={searchNote}>{tf("search.capped", { n: SEARCH_MAX_RESULTS })}</p>
      )}
    </section>
  );
}

function EventResults({ query }: { query: string }) {
  const locale = useLocale();
  const events = runOccupationSearch(query);
  const professors = matchingProfessors(events.groups, query);

  if (!events.groups.length) return null;

  return (
    <>
      {professors.length > 0 && (
        <section className={searchSection}>
          <SectionTitle>{t("search.professors")}</SectionTitle>
          <ChipRow>
            {professors.map((name) => (
              <Chip key={name} onClick={() => setQuery(titleCase(name, locale))}>
                <Icon name="user-multiple" />
                <span>
                  <Highlight text={titleCase(name, locale)} query={query} />
                </span>
              </Chip>
            ))}
          </ChipRow>
        </section>
      )}
      <section className={searchSection}>
        <SectionTitle>
          {t("search.lessons")} <SectionCount>{events.total}</SectionCount>
        </SectionTitle>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
          {events.groups.map((group, index) => (
            <li
              key={index}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3.5"
            >
              <div className="flex items-start gap-2">
                <h3 className="flex-1 text-16 leading-[1.3] font-bold">
                  <Highlight
                    text={titleCase(group.title || t("schedule.occupied"), locale)}
                    query={query}
                  />
                </h3>
                {group.isExam && <Tag tone="exam">{t("schedule.exam")}</Tag>}
              </div>
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-13 text-muted">
                {group.professors.length > 0 && (
                  <span className={eventMetaItem}>
                    <Icon name="user-multiple" />
                    <span>
                      <ProfessorList names={group.professors} query={query} />
                    </span>
                  </span>
                )}
                {group.code != null && (
                  <span className={eventMetaItem}>
                    <Highlight text={String(group.code)} query={query} />
                  </span>
                )}
                {group.section && <span className={eventMetaItem}>{group.section}</span>}
              </p>
              <ul className="flex flex-col border-t border-border">
                {group.sessions.slice(0, events.maxSessions).map((session, sessionIndex) => {
                  const entry = findClassroom(session.roomId);

                  return (
                    <li key={sessionIndex}>
                      <button
                        type="button"
                        className={cn(
                          "group/session grid w-full grid-cols-[1fr_auto] items-center gap-x-2 border-b border-border px-0.5 py-2 text-left",
                          "transition-[scale] [li:last-child>&]:border-b-0",
                          pressable,
                        )}
                        disabled={!entry}
                        onClick={() =>
                          entry &&
                          openClassroom(entry, {
                            date: session.date,
                            from: session.inizio,
                            to: session.fine,
                            highlight: true,
                          })
                        }
                      >
                        <span className="flex gap-2 text-14 tabular-nums">
                          <span className="min-w-[82px] text-muted">
                            {formatDay(session.date, locale)}
                          </span>
                          <strong className="group-hover/session:text-accent-strong">
                            {formatRange(session.inizio, session.fine)}
                          </strong>
                        </span>
                        <span className="col-start-1 text-13 text-subtle">
                          {session.roomName} · {session.buildingAltName || session.buildingName} ·{" "}
                          {session.campusName}
                        </span>
                        <Icon name="arrow-right-01" className="col-start-2 row-[1/3] text-subtle" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {(group.sessionCount ?? 0) > events.maxSessions && (
                <p className={searchNote}>
                  {tf("search.moreSessions", {
                    n: (group.sessionCount ?? 0) - events.maxSessions,
                  })}
                </p>
              )}
            </li>
          ))}
        </ul>
        {events.capped && (
          <p className={searchNote}>{tf("search.capped", { n: OCC_MAX_GROUPS })}</p>
        )}
      </section>
    </>
  );
}

export function SearchResults() {
  useLocale();
  const query = useStore((state) => state.query.trim());
  const revision = useStore((state) => state.dataRevision);
  const occupancy = useStore((state) => state.occupancy);

  const empty = useMemo(
    () =>
      !runClassroomSearch(query).visible.length &&
      !runOccupationSearch(query).groups.length &&
      revision >= 0,
    [query, revision],
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-gutter pt-5 pb-8 lg:pt-7"
      aria-live="polite"
    >
      {empty ? (
        <EmptyState
          icon="search-01"
          title={tf("search.emptyTitle", { query })}
          text={occupancy === "loading" ? t("search.loadingLessons") : t("search.emptyText")}
        />
      ) : (
        <>
          <RoomResults query={query} />
          <EventResults key={revision} query={query} />
        </>
      )}
    </div>
  );
}
