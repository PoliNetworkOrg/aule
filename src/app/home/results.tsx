import { lazy, Suspense, useMemo } from "react";
import { formatRomeYYYYMMDD } from "../available-rooms-script";
import { reloadOccupancy } from "../boot";
import { t, tf, useLocale } from "../i18n";
import {
  campusClosed,
  countRooms,
  filterImpact,
  findAvailability,
  findCampus,
  visibleResults,
  type BuildingAvailability,
} from "../state/availability";
import {
  clearFilter,
  countActiveFilters,
  resetFilters,
  setFilters,
  setMapBuilding,
  setView,
  useStore,
  type RestrictiveFilter,
  type ResultsView,
} from "../state/store";
import { capitalise, formatRange, parseIsoDate, romeTodayIso } from "../state/time";
import { cn } from "../../lib/cn";
import { Icon } from "../ui/icon";
import { RoomCard } from "./room-card";
import { StableText } from "../ui/stable";

const CampusMap = lazy(() => import("./campus-map"));

export function useAvailability() {
  const campusId = useStore((state) => state.campusId);
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const filters = useStore((state) => state.filters);
  const revision = useStore((state) => state.dataRevision);

  return useMemo(
    () => (date && revision ? findAvailability(campusId, date, from, to, filters) : []),
    [campusId, date, from, to, filters, revision],
  );
}

/** The rooms the list shows: availability minus partially free ones unless asked for. */
export function useVisibleResults() {
  const all = useAvailability();
  const filters = useStore((state) => state.filters);

  return useMemo(() => visibleResults(all, filters), [all, filters]);
}

function ViewSwitch() {
  const view = useStore((state) => state.view);

  const options: { value: ResultsView; icon: string; label: string }[] = [
    { value: "list", icon: "list-view", label: "results.list" },
    { value: "map", icon: "maps", label: "results.map" },
  ];

  return (
    <div className="segmented segmented--icons" role="group" aria-label={t("results.view")}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={view === option.value}
          aria-label={t(option.label)}
          title={t(option.label)}
          className="segmented__option"
          onClick={() => setView(option.value)}
        >
          <Icon name={option.icon} />
          <StableText k={option.label} />
        </button>
      ))}
    </div>
  );
}

function Summary({ results }: { results: BuildingAvailability[] }) {
  const locale = useLocale();
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const campus = findCampus(useStore((state) => state.campusId));
  const occupancy = useStore((state) => state.occupancy);
  const filters = useStore((state) => state.filters);
  const rooms = results.flatMap((building) => building.rooms);
  const free = rooms.filter((room) => room.status === "free").length;
  const partial = rooms.length - free;

  const day = date
    ? date === romeTodayIso()
      ? t("when.today")
      : capitalise(
          new Intl.DateTimeFormat(locale, {
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(parseIsoDate(date)),
          locale,
        )
    : "";

  return (
    <div className="summary">
      <p className="summary__count">
        {occupancy === "loading" && !rooms.length
          ? t("results.loading")
          : free === 1
            ? t("results.oneRoom")
            : tf("results.rooms", { n: free })}
        {partial > 0 && (
          <button
            type="button"
            className="summary__partial"
            aria-pressed={filters.partial}
            title={tf(filters.partial ? "results.hidePartial" : "results.showPartial", {
              n: partial,
            })}
            onClick={() => setFilters({ partial: !filters.partial })}
          >
            {tf(filters.partial ? "results.hidePartialShort" : "results.showPartialShort", {
              n: partial,
            })}
          </button>
        )}
      </p>
      <p className="summary__context">
        {campus?.name} · {day} · {formatRange(from, to)}
      </p>
    </div>
  );
}

function DataNotice() {
  const generatedAt = useStore((state) => state.generatedAt);
  const occupancy = useStore((state) => state.occupancy);
  const openingHours = useStore((state) => state.openingHours);

  if (occupancy === "error")
    return (
      <div className="notice notice--error" role="alert">
        <Icon name="alert-02" />
        <span>{t("data.error")}</span>
        <button
          type="button"
          className="button button--ghost"
          onClick={() => void reloadOccupancy()}
        >
          {t("data.retry")}
        </button>
      </div>
    );

  if (generatedAt && formatRomeYYYYMMDD(generatedAt) !== formatRomeYYYYMMDD(new Date()))
    return (
      <div className="notice notice--warning">
        <Icon name="alert-02" />
        <span>{t("data.stale")}</span>
      </div>
    );

  // Occupancy loaded but opening hours did not: rooms are listed as if every
  // building were open, so say so and let the user retry.
  if (occupancy === "ready" && !openingHours)
    return (
      <div className="notice notice--warning">
        <Icon name="alert-02" />
        <span>{t("data.hoursUnavailable")}</span>
        <button
          type="button"
          className="button button--ghost"
          onClick={() => void reloadOccupancy()}
        >
          {t("data.retry")}
        </button>
      </div>
    );

  return null;
}

function BuildingGroup({ group }: { group: BuildingAvailability }) {
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const { building, rooms } = group;

  return (
    <section className="building-group" aria-labelledby={`building-${building.name}`}>
      <header className="building-group__header">
        <h3 className="building-group__title" id={`building-${building.name}`}>
          {t("building.prefix")} {building.name}
          {building.altName && <span className="building-group__alt">{building.altName}</span>}
        </h3>
        <span className="building-group__count">
          {tf(rooms.length === 1 ? "results.oneAvailable" : "results.available", {
            n: rooms.length,
          })}
        </span>
        <button
          type="button"
          className="icon-button icon-button--small"
          aria-label={tf("results.showOnMap", { name: building.name })}
          title={tf("results.showOnMap", { name: building.name })}
          onClick={() => {
            setView("map");
            setMapBuilding(building.name);
          }}
        >
          <Icon name="maps-location-01" />
        </button>
      </header>
      <ul className="room-grid">
        {rooms.map((result) => (
          <RoomCard key={result.room.id} result={result} date={date} from={from} to={to} />
        ))}
      </ul>
    </section>
  );
}

const FILTER_LABELS: Record<RestrictiveFilter, string> = {
  sockets: "filters.sockets",
  accessible: "filters.accessible",
  minSeats: "filters.seats",
  building: "filters.building",
  network: "filters.network",
};

/**
 * Helps out when the list is short: offers the partially free rooms when no
 * room is free for the whole window, and names the filters hiding the most rooms.
 */
function ResultsHints({ all, shown }: { all: BuildingAvailability[]; shown: number }) {
  useLocale();
  const campusId = useStore((state) => state.campusId);
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const filters = useStore((state) => state.filters);
  const partial = countRooms(all) - countRooms(visibleResults(all, { ...filters, partial: false }));

  const impact = useMemo(
    () => (shown < 8 && date ? filterImpact(campusId, date, from, to, filters) : []),
    [shown, campusId, date, from, to, filters],
  );

  const offerPartial = !filters.partial && shown === 0 && partial > 0;

  if (!offerPartial && !impact.length) return null;

  return (
    <div className="hints">
      {offerPartial && (
        <div className="hint">
          <Icon name="time-quarter-pass" className="hint__icon" />
          <p className="hint__text">{tf("results.onlyPartial", { n: partial })}</p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => setFilters({ partial: true })}
          >
            <StableText k="results.showPartialButton" />
          </button>
        </div>
      )}
      {impact.length > 0 && (
        <div className="hint">
          <Icon name="filter-horizontal" className="hint__icon" />
          <p className="hint__text">{t("results.filterImpact")}</p>
          <div className="chip-row chip-row--wrap">
            {impact.map(({ key, gain }) => (
              <button
                key={key}
                type="button"
                className="chip chip--impact"
                onClick={() => clearFilter(key)}
              >
                <Icon name="cancel-01" />
                {key === "minSeats"
                  ? tf("filters.seatsValue", { n: filters.minSeats })
                  : key === "building"
                    ? `${t("building.prefix")} ${filters.building}`
                    : t(FILTER_LABELS[key])}
                <span className="chip__gain">+{gain}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsList({
  all,
  results,
}: {
  all: BuildingAvailability[];
  results: BuildingAvailability[];
}) {
  const occupancy = useStore((state) => state.occupancy);
  const filters = useStore((state) => state.filters);
  const campusId = useStore((state) => state.campusId);
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const shown = countRooms(results);
  const allClosed = !!date && campusClosed(campusId, date, from, to);

  if (occupancy === "loading" && !all.length)
    return (
      <div className="results-list" aria-busy="true">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="skeleton-group">
            <span className="skeleton skeleton--title" />
            <div className="room-grid">
              {Array.from({ length: 4 }, (__, card) => (
                <span key={card} className="skeleton skeleton--card" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <div className="results-list">
      <ResultsHints all={all} shown={shown} />
      {results.length ? (
        results.map((group) => <BuildingGroup key={group.building.name} group={group} />)
      ) : (
        <div className="empty-state">
          <Icon name="door-01" className="empty-state__icon" />
          <p className="empty-state__title">
            {t(allClosed ? "results.closedTitle" : "results.emptyTitle")}
          </p>
          <p className="empty-state__text">
            {allClosed
              ? t("results.closedText")
              : countActiveFilters(filters)
                ? t("results.emptyFiltered")
                : t("results.emptyText")}
          </p>
          {countActiveFilters(filters) > 0 && (
            <button type="button" className="button button--ghost" onClick={resetFilters}>
              <StableText k="filters.resetAll" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Results({ className }: { className?: string }) {
  useLocale();
  const all = useAvailability();
  const filters = useStore((state) => state.filters);
  const results = useMemo(() => visibleResults(all, filters), [all, filters]);
  const view = useStore((state) => state.view);

  return (
    <section className={cn("results", className)} aria-label={t("results.title")}>
      <div className="results__toolbar">
        <Summary results={all} />
        <ViewSwitch />
      </div>
      <DataNotice />
      <div className={`results__body results__body--${view}`}>
        {view === "list" ? (
          <ResultsList all={all} results={results} />
        ) : (
          <Suspense fallback={<div className="map-placeholder" />}>
            <CampusMap results={results} />
          </Suspense>
        )}
      </div>
    </section>
  );
}
