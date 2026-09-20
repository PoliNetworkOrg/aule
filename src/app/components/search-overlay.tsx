import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { t, getLocale, onTranslationChange, getTranslationVersion } from "../i18n";
import { ClassroomCard, Highlight } from "./classroom-card";
import { createTimeFormatter } from "../utils/time-format";
import { getClassroomStatusNow } from "../available-rooms-script";
import {
  runClassroomSearch,
  runOccupationSearch,
  SEARCH_MAX_RESULTS,
  OCC_MAX_GROUPS,
  type OccupationGroup,
} from "../classroom-search-data";
import { initSearchOverlay } from "./search-overlay-controller";

export { openSearchOverlay, closeSearchOverlay } from "./search-overlay-controller";

function TooManyNotice({ count }: { count: number }) {
  return (
    <p className="search-too-many-notice">
      {t("search.tooManyResults").replace("{n}", String(count))}
    </p>
  );
}

function formatTime(value: string, formatter: Intl.DateTimeFormat) {
  const [h, m] = value.split(":").map(Number);

  return Number.isFinite(h) && Number.isFinite(m)
    ? formatter.format(new Date(2000, 0, 1, h, m))
    : value;
}

function formatDate(value: string, formatter: Intl.DateTimeFormat) {
  const date = new Date(`${value}T00:00`);

  return Number.isNaN(date.getTime()) ? value : formatter.format(date);
}

function EventCard({
  group: g,
  maxSessions,
  query,
}: {
  group: OccupationGroup;
  maxSessions: number;
  query: string;
}) {
  const dateFmt = new Intl.DateTimeFormat(getLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const timeFmt = createTimeFormatter();
  const meta: string[] = [];

  if (g.code != null) meta.push(String(g.code).padStart(6, "0"));

  if (g.section) meta.push(g.section);

  if (g.professors.length) meta.push(g.professors.join(", "));

  return (
    <div className="search-event-card">
      <div className="search-event-head">
        <span className="search-event-title">
          <Highlight text={g.title || t("detail.occupied")} query={query} />
        </span>
        {g.isExam && <span className="timeline-popover-badge">{t("detail.examLabel")}</span>}
      </div>
      {!!meta.length && (
        <div className="timeline-popover-meta">
          {meta.map((text, index) => (
            <span key={index}>
              <Highlight text={text} query={query} />
            </span>
          ))}
        </div>
      )}
      <div className="search-event-sessions">
        {g.sessions.slice(0, maxSessions).map((s, index) => (
          <button
            key={index}
            type="button"
            className="search-event-session liquid-glass"
            data-open-classroom={s.roomId}
          >
            <span className="ses-when">
              {formatDate(s.date, dateFmt)} · {formatTime(s.inizio, timeFmt)}–
              {formatTime(s.fine, timeFmt)}
            </span>
            <span className="ses-where secondary">
              {s.roomName} · {s.buildingAltName || s.buildingName}
            </span>
          </button>
        ))}
        {(g.sessionCount ?? 0) > maxSessions && (
          <p className="search-event-more secondary">
            {t("search.moreSessions").replace("{n}", String((g.sessionCount ?? 0) - maxSessions))}
          </p>
        )}
      </div>
    </div>
  );
}

function SearchResults({ query }: { query: string }) {
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let timer = 0;

    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => gridRef.current?.classList.add("appeared"), 400);
    });

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);
  const q = query.trim();

  if (!q) return null;
  const rooms = runClassroomSearch(q);
  const events = runOccupationSearch(q);
  const hasRooms = rooms.visible.length > 0;
  const hasEvents = events.groups.length > 0;

  if (!hasRooms && !hasEvents)
    return (
      <div className="search-empty-state">
        <i className="hgi-stroke hgi-search-remove empty-container-icon" aria-hidden="true" />
        <p className="empty-container-title">{t("search.emptyTitle")}</p>
        <p className="empty-container-subtitle">{t("search.emptySubtitle")}</p>
      </div>
    );

  return (
    <>
      {hasRooms && (
        <>
          {hasEvents && <div className="search-section-label">{t("search.sectionClassrooms")}</div>}
          <div ref={gridRef} className="search-grid search-grid--classroom">
            {rooms.visible.map((room) => (
              <ClassroomCard
                key={room.id}
                classroom={{ ...room, status: getClassroomStatusNow(room.id) }}
                building={{
                  name: room.buildingName,
                  altName: [room.buildingAltName, room.campusName].filter(Boolean).join(" · "),
                }}
                query={q}
                showFavouriteStar
              />
            ))}
          </div>
          {rooms.capped && <TooManyNotice count={SEARCH_MAX_RESULTS} />}
        </>
      )}
      {hasEvents && (
        <>
          <div className="search-section-label">{t("search.sectionEvents")}</div>
          <div className="search-event-list">
            {events.groups.map((group, index) => (
              <EventCard key={index} group={group} maxSessions={events.maxSessions} query={q} />
            ))}
          </div>
          {events.capped && <TooManyNotice count={OCC_MAX_GROUPS} />}
        </>
      )}
    </>
  );
}

export function SearchOverlay() {
  useSyncExternalStore(onTranslationChange, getTranslationVersion);
  const [search, setSearch] = useState({ query: "", version: 0 });
  useLayoutEffect(
    () =>
      initSearchOverlay((query) =>
        flushSync(() => setSearch((previous) => ({ query, version: previous.version + 1 }))),
      ),
    [],
  );

  return (
    <div id="search-overlay" className="search-overlay-backdrop" hidden>
      <div
        className="search-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Search classrooms"
      >
        <div className="search-overlay-header">
          <div className="search-bar-wrapper liquid-glass">
            <i className="hgi-stroke hgi-search-01" aria-hidden="true"></i>
            <input
              type="text"
              id="classroom-search-input"
              className="search-input"
              data-i18n-attr="placeholder:search.inputPlaceholder"
              placeholder={t("search.inputPlaceholder")}
              autoComplete="off"
              spellCheck="false"
            />
            <button
              id="classroom-search-clear"
              className="search-clear-btn"
              type="button"
              tabIndex={-1}
              aria-label="Clear search"
            >
              <i className="hgi-stroke hgi-cancel-01" aria-hidden="true"></i>
            </button>
          </div>
          <button
            id="search-overlay-close"
            className="search-overlay-close liquid-glass"
            type="button"
            aria-label="Close search"
          >
            <i className="hgi-stroke hgi-cancel-01" aria-hidden="true"></i>
          </button>
        </div>
        <div id="search-overlay-results" className="search-overlay-results">
          <SearchResults key={search.version} query={search.query} />
        </div>
      </div>
    </div>
  );
}
