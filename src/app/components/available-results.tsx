import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { t, onTranslationChange, getTranslationVersion } from "../i18n";
import { ClassroomCard } from "./classroom-card";
import { buildingOverview, type OverviewContext } from "./building-overview";
import { activateGroupTab } from "./bottom-nav";
import { goToBuilding } from "./campus-buildings";
import { SHOW_PARTIAL_KEY } from "./settings";

interface Results extends OverviewContext {
  revision: number;
}

let state: Results | null = null;

let revision = 0;

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function renderAvailableClassroomsResults(
  results: OverviewContext["results"],
  date: string,
  from: string,
  to: string,
  campusId: string,
) {
  buildingOverview.reset();
  state = { results, date, from, to, campusId, revision: ++revision };
  flushSync(() => listeners.forEach((listener) => listener()));
}

function BuildingSection({
  result,
  context,
  cardIndex,
}: {
  result: OverviewContext["results"][number];
  context: OverviewContext;
  cardIndex: number;
}) {
  const section = useRef<HTMLLIElement>(null);
  const downAt = useRef<{ x: number; y: number; t: number } | null>(null);
  const { building, rooms } = result;

  const openOverview = () => {
    if (section.current)
      buildingOverview.open({
        ...context,
        sourceSection: section.current,
        buildingName: building.name,
      });
  };

  const allPartial = rooms.every((room) => room.status === "partially-free");

  return (
    <li
      ref={section}
      className="building-section"
      data-building-name={building.name}
      data-building-id={building.id ?? undefined}
      data-all-partial={allPartial ? "true" : undefined}
    >
      <div
        className="building-section-header"
        style={{ animationDelay: `${Math.min(cardIndex * 30, 300)}ms` }}
      >
        <button
          className="building-section-titles liquid-glass"
          type="button"
          aria-haspopup="dialog"
          aria-label={`${t("building.prefix")} ${building.name}`}
          onPointerDown={(e) => {
            downAt.current = { x: e.clientX, y: e.clientY, t: performance.now() };

            if (section.current) buildingOverview.prewarm(section.current);
          }}
          onPointerUp={(e) => {
            const start = downAt.current;

            if (!start) return;
            downAt.current = null;

            if (
              Math.hypot(e.clientX - start.x, e.clientY - start.y) <= 12 &&
              performance.now() - start.t < 700
            )
              openOverview();
          }}
          onClick={openOverview}
        >
          <span className="building-name">
            {t("building.prefix")} {building.name}
          </span>
          {building.altName && <span className="building-alt-name">{building.altName}</span>}
        </button>
        <button
          className="header-button building-section-btn liquid-glass"
          type="button"
          aria-label={t("building.viewInCampus").replace("{name}", building.name)}
          onClick={() => {
            activateGroupTab("search-classrooms-container");
            goToBuilding(context.campusId, building.name);
          }}
        >
          <i className="hgi-stroke hgi-arrow-right-01" aria-hidden="true" />
        </button>
      </div>
      {rooms.map((room, index) => (
        <div key={room.id} className="classroom-list-item-container" data-status={room.status}>
          <ClassroomCard
            classroom={room}
            building={building}
            fromTime={context.from}
            toTime={context.to}
            date={context.date}
            showFavouriteStar
            style={{ animationDelay: `${Math.min((cardIndex + 1 + index) * 30, 300)}ms` }}
          />
        </div>
      ))}
    </li>
  );
}

function ResultsList({ context }: { context: OverviewContext }) {
  const list = useRef<HTMLUListElement>(null);

  const [showPartial, setShowPartial] = useState(() => {
    const saved = localStorage.getItem(SHOW_PARTIAL_KEY);

    return saved === null || saved === "true";
  });

  const hasPartial = context.results.some((result) =>
    result.rooms.some((room) => room.status === "partially-free"),
  );

  useLayoutEffect(() => {
    if (hasPartial && !showPartial)
      document.getElementById("available-classrooms-results")?.classList.add("hide-partial");
  }, [hasPartial, showPartial]);
  useEffect(() => {
    let timer = 0;

    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => list.current?.classList.add("appeared"), 800);
    });

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);
  let cardIndex = 0;
  const sections = [];

  for (const result of context.results) {
    sections.push(
      <BuildingSection
        key={result.building.name}
        result={result}
        context={context}
        cardIndex={cardIndex}
      />,
    );
    cardIndex += 1 + result.rooms.length;
  }

  return (
    <>
      {hasPartial && (
        <div className="results-filter-row">
          <button
            className={`results-filter-btn${showPartial ? " active" : ""}`}
            onClick={() => {
              const next = !showPartial;
              setShowPartial(next);
              document
                .getElementById("available-classrooms-results")
                ?.classList.toggle("hide-partial", !next);
            }}
          >
            <i className="hgi-stroke hgi-filter" /> {t("results.filterPartial")}
          </button>
        </div>
      )}
      <ul ref={list} className="list-outer-container">
        {sections}
      </ul>
    </>
  );
}

export function AvailableResults() {
  const results = useSyncExternalStore(subscribe, () => state);
  useSyncExternalStore(onTranslationChange, getTranslationVersion);
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!results) return;
    container.current!.dataset.searched = "true";
    container.current!.classList.toggle("empty", !results.results.length);
  }, [results]);
  useLayoutEffect(() => () => buildingOverview.destroy(), []);

  return (
    <div
      ref={container}
      id="available-classrooms-results"
      className="available-classrooms-container empty"
    >
      {results?.results.length ? (
        <ResultsList key={results.revision} context={results} />
      ) : (
        <>
          <i
            className={`hgi-stroke ${results ? "hgi-search-remove" : "hgi-search-01"} empty-container-icon`}
            aria-hidden="true"
          />
          <p className="empty-container-title" data-react-owned="">
            {t(results ? "results.noResultsTitle" : "results.emptyTitle")}
          </p>
          <p className="empty-container-subtitle" data-react-owned="">
            {t(results ? "results.noResultsSubtitle" : "results.emptySubtitle")}
          </p>
        </>
      )}
    </div>
  );
}
