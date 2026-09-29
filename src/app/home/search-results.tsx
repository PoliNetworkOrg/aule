import { useMemo } from "react";
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
import { Icon } from "../ui/icon";
import { StatusTag } from "./room-card";
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

function RoomResults({ query }: { query: string }) {
  useLocale();
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const rooms = runClassroomSearch(query);

  if (!rooms.visible.length) return null;

  return (
    <section className="search-section">
      <h2 className="section-title">
        {t("search.rooms")} <span className="section-title__count">{rooms.total}</span>
      </h2>
      <ul className="search-rooms">
        {rooms.visible.map((room) => {
          const entry = findClassroom(room.id);
          const availability = date ? roomWindowStatus(room.id, date, from, to) : null;

          if (!entry) return null;

          return (
            <li key={room.id}>
              <button
                type="button"
                className="search-room"
                onClick={() =>
                  openClassroom(entry, date ? { date, from, to, highlight: false } : null)
                }
              >
                <span className="search-room__name">
                  <Highlight text={room.name} query={query} />
                </span>
                <span className="search-room__meta">
                  {t("building.prefix")} <Highlight text={room.buildingName} query={query} />
                  {room.buildingAltName ? ` · ${room.buildingAltName}` : ""} ·{" "}
                  <Highlight text={room.campusName} query={query} />
                </span>
                {availability && (
                  <StatusTag status={availability.status} slots={availability.slots} compact />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {rooms.capped && (
        <p className="search-note">{tf("search.capped", { n: SEARCH_MAX_RESULTS })}</p>
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
        <section className="search-section">
          <h2 className="section-title">{t("search.professors")}</h2>
          <div className="chip-row chip-row--wrap">
            {professors.map((name) => (
              <button
                key={name}
                type="button"
                className="chip"
                onClick={() => setQuery(titleCase(name, locale))}
              >
                <Icon name="user-multiple" />
                <span>
                  <Highlight text={titleCase(name, locale)} query={query} />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="search-section">
        <h2 className="section-title">
          {t("search.lessons")} <span className="section-title__count">{events.total}</span>
        </h2>
        <ul className="search-events">
          {events.groups.map((group, index) => (
            <li key={index} className="search-event">
              <div className="search-event__head">
                <h3 className="search-event__title">
                  <Highlight
                    text={titleCase(group.title || t("schedule.occupied"), locale)}
                    query={query}
                  />
                </h3>
                {group.isExam && <span className="tag tag--exam">{t("schedule.exam")}</span>}
              </div>
              <p className="search-event__meta">
                {group.professors.length > 0 && (
                  <span>
                    <Icon name="user-multiple" />
                    <span>
                      <ProfessorList names={group.professors} query={query} />
                    </span>
                  </span>
                )}
                {group.code != null && (
                  <span>
                    <Highlight text={String(group.code)} query={query} />
                  </span>
                )}
                {group.section && <span>{group.section}</span>}
              </p>
              <ul className="search-sessions">
                {group.sessions.slice(0, events.maxSessions).map((session, sessionIndex) => {
                  const entry = findClassroom(session.roomId);

                  return (
                    <li key={sessionIndex}>
                      <button
                        type="button"
                        className="search-session"
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
                        <span className="search-session__when">
                          <span>{formatDay(session.date, locale)}</span>
                          <strong>{formatRange(session.inizio, session.fine)}</strong>
                        </span>
                        <span className="search-session__where">
                          {session.roomName} · {session.buildingAltName || session.buildingName} ·{" "}
                          {session.campusName}
                        </span>
                        <Icon name="arrow-right-01" className="search-session__chevron" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {(group.sessionCount ?? 0) > events.maxSessions && (
                <p className="search-note">
                  {tf("search.moreSessions", {
                    n: (group.sessionCount ?? 0) - events.maxSessions,
                  })}
                </p>
              )}
            </li>
          ))}
        </ul>
        {events.capped && (
          <p className="search-note">{tf("search.capped", { n: OCC_MAX_GROUPS })}</p>
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
    <div className="search-results" aria-live="polite">
      {empty ? (
        <div className="empty-state">
          <Icon name="search-01" className="empty-state__icon" />
          <p className="empty-state__title">{tf("search.emptyTitle", { query })}</p>
          <p className="empty-state__text">
            {occupancy === "loading" ? t("search.loadingLessons") : t("search.emptyText")}
          </p>
        </div>
      ) : (
        <>
          <RoomResults query={query} />
          <EventResults key={revision} query={query} />
        </>
      )}
    </div>
  );
}
