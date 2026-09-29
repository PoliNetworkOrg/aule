import { lazy, Suspense, useMemo } from "react";
import { formatRomeYYYYMMDD } from "../available-rooms-script";
import { reloadOccupancy } from "../boot";
import { t, tf, useLocale } from "../i18n";
import { findAvailability, findCampus, type BuildingAvailability } from "../state/availability";
import {
  countActiveFilters,
  resetFilters,
  setMapBuilding,
  setView,
  useStore,
  type ResultsView,
} from "../state/store";
import { capitalise, formatRange, parseIsoDate, romeTodayIso } from "../state/time";
import { Icon } from "../ui/icon";
import { RoomCard } from "./room-card";

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

function ViewSwitch() {
  const view = useStore((state) => state.view);

  const options: { value: ResultsView; icon: string; label: string }[] = [
    { value: "list", icon: "list-view", label: t("results.list") },
    { value: "map", icon: "maps", label: t("results.map") },
  ];

  return (
    <div className="segmented segmented--icons" role="group" aria-label={t("results.view")}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={view === option.value}
          className="segmented__option"
          onClick={() => setView(option.value)}
        >
          <Icon name={option.icon} />
          <span>{option.label}</span>
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
          <span className="summary__partial">{tf("results.partial", { n: partial })}</span>
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

function ResultsList({ results }: { results: BuildingAvailability[] }) {
  const occupancy = useStore((state) => state.occupancy);
  const filters = useStore((state) => state.filters);

  if (occupancy === "loading" && !results.length)
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

  if (!results.length)
    return (
      <div className="empty-state">
        <Icon name="door-01" className="empty-state__icon" />
        <p className="empty-state__title">{t("results.emptyTitle")}</p>
        <p className="empty-state__text">
          {countActiveFilters(filters) ? t("results.emptyFiltered") : t("results.emptyText")}
        </p>
        {countActiveFilters(filters) > 0 && (
          <button type="button" className="button button--ghost" onClick={resetFilters}>
            {t("filters.reset")}
          </button>
        )}
      </div>
    );

  return (
    <div className="results-list">
      {results.map((group) => (
        <BuildingGroup key={group.building.name} group={group} />
      ))}
    </div>
  );
}

export function Results() {
  useLocale();
  const results = useAvailability();
  const view = useStore((state) => state.view);

  return (
    <section className="results" aria-label={t("results.title")}>
      <div className="results__toolbar">
        <Summary results={results} />
        <ViewSwitch />
      </div>
      <DataNotice />
      <div className={`results__body results__body--${view}`}>
        {view === "list" ? (
          <ResultsList results={results} />
        ) : (
          <Suspense fallback={<div className="map-placeholder" />}>
            <CampusMap results={results} />
          </Suspense>
        )}
      </div>
    </section>
  );
}
