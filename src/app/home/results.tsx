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
import { Button, IconButton } from "../ui/button";
import { Chip, ChipRow } from "../ui/chip";
import { EmptyState, emptyStateAction } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { Notice, noticeAction } from "../ui/notice";
import { Segmented, SegmentedOption } from "../ui/segmented";
import { Skeleton } from "../ui/skeleton";
import { RoomCard, roomGrid } from "./room-card";
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
    <Segmented role="group" aria-label={t("results.view")}>
      {options.map((option) => (
        <SegmentedOption
          key={option.value}
          aria-pressed={view === option.value}
          aria-label={t(option.label)}
          title={t(option.label)}
          // Phones: icon only.
          className="max-sm:px-2.5 max-sm:text-18 max-sm:[&_span]:hidden"
          onClick={() => setView(option.value)}
        >
          <Icon name={option.icon} />
          <StableText k={option.label} />
        </SegmentedOption>
      ))}
    </Segmented>
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
    <div className="min-w-0 flex-1">
      <p className="text-16 font-bold max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-2 max-sm:gap-y-1">
        {occupancy === "loading" && !rooms.length
          ? t("results.loading")
          : free === 1
            ? t("results.oneRoom")
            : tf("results.rooms", { n: free })}
        {partial > 0 && (
          // Off (grey) while partly free rooms are hidden, lit in the partial colour once
          // listed. A dashed edge, like the other chips that add or drop results, so it
          // reads as a toggle and not a count label.
          <button
            type="button"
            className={cn(
              "ml-2 rounded-full border border-dashed border-current/45 bg-surface-muted px-2 py-px text-14 font-bold text-muted",
              "transition-[border-color,color] hover:border-partial hover:text-partial",
              "aria-pressed:border-partial-border aria-pressed:bg-partial-soft aria-pressed:text-partial",
              "max-sm:ml-0 max-sm:text-13",
            )}
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
      {/* Phones: campus, day and time are right above in the controls summary. */}
      <p className="truncate text-13 text-muted tabular-nums max-sm:hidden">
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
      <Notice tone="error" className={noticeMargin} role="alert">
        <Icon name="alert-02" />
        <span>{t("data.error")}</span>
        <Button variant="ghost" className={noticeAction} onClick={() => void reloadOccupancy()}>
          {t("data.retry")}
        </Button>
      </Notice>
    );

  if (generatedAt && formatRomeYYYYMMDD(generatedAt) !== formatRomeYYYYMMDD(new Date()))
    return (
      <Notice tone="warning" className={noticeMargin}>
        <Icon name="alert-02" />
        <span>{t("data.stale")}</span>
      </Notice>
    );

  // Occupancy loaded but opening hours did not: rooms are listed as if every
  // building were open, so say so and let the user retry.
  if (occupancy === "ready" && !openingHours)
    return (
      <Notice tone="warning" className={noticeMargin}>
        <Icon name="alert-02" />
        <span>{t("data.hoursUnavailable")}</span>
        <Button variant="ghost" className={noticeAction} onClick={() => void reloadOccupancy()}>
          {t("data.retry")}
        </Button>
      </Notice>
    );

  return null;
}

const noticeMargin = "mx-gutter mt-2.5 lg:mx-5";

function BuildingGroup({ group }: { group: BuildingAvailability }) {
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const { building, rooms } = group;

  return (
    <section className="flex flex-col" aria-labelledby={`building-${building.name}`}>
      {/* Sticks 8px above the scrollport with 8px of extra top padding: the header's
          own background covers the edge, where the scrollport's fractional offset
          (and iOS momentum scrolling) would otherwise leave a sliver of rows. */}
      <header className="sticky -top-2 z-1 -mx-gutter -mt-2 flex items-center gap-2.5 bg-surface px-gutter pt-4 pb-2 lg:-mx-5 lg:px-5">
        <h3
          className="flex items-baseline gap-2 text-16 font-bold"
          id={`building-${building.name}`}
        >
          {t("building.prefix")} {building.name}
          {building.altName && (
            <span className="text-14 font-medium text-muted">{building.altName}</span>
          )}
        </h3>
        <span className="text-13 text-subtle">
          {tf(rooms.length === 1 ? "results.oneAvailable" : "results.available", {
            n: rooms.length,
          })}
        </span>
        {/* Beside the building it maps, not across the pane from it. */}
        <IconButton
          size="small"
          className="-ml-1"
          aria-label={tf("results.showOnMap", { name: building.name })}
          title={tf("results.showOnMap", { name: building.name })}
          onClick={() => {
            setView("map");
            setMapBuilding(building.name);
          }}
        >
          <Icon name="maps-location-01" />
        </IconButton>
      </header>
      <ul className={roomGrid}>
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

const hint =
  "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-lg border border-accent-soft-border bg-accent-soft px-3.5 py-3";

const hintIcon = "text-20 text-accent";

/** The hint's action sits under its text. */
const hintAction = "col-start-2 justify-self-start";

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
    <div className="grid gap-2.5">
      {offerPartial && (
        <div className={hint}>
          <Icon name="time-quarter-pass" className={hintIcon} />
          <p className="text-14">{tf("results.onlyPartial", { n: partial })}</p>
          <Button
            variant="primary"
            className={hintAction}
            onClick={() => setFilters({ partial: true })}
          >
            <StableText k="results.showPartialButton" />
          </Button>
        </div>
      )}
      {impact.length > 0 && (
        <div className={hint}>
          <Icon name="filter-horizontal" className={hintIcon} />
          <p className="text-14">{t("results.filterImpact")}</p>
          <ChipRow className={hintAction}>
            {impact.map(({ key, gain }) => (
              <Chip key={key} variant="impact" onClick={() => clearFilter(key)}>
                <Icon name="cancel-01" />
                {key === "minSeats"
                  ? tf("filters.seatsValue", { n: filters.minSeats })
                  : key === "building"
                    ? `${t("building.prefix")} ${filters.building}`
                    : t(FILTER_LABELS[key])}
                <span className="font-bold text-free">+{gain}</span>
              </Chip>
            ))}
          </ChipRow>
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
      <div className={resultsList} aria-busy="true">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index}>
            <Skeleton className="mb-3 h-[18px] w-[140px]" />
            <div className={roomGrid}>
              {Array.from({ length: 4 }, (__, card) => (
                <Skeleton key={card} className="h-[86px]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <div className={resultsList}>
      <ResultsHints all={all} shown={shown} />
      {results.length ? (
        results.map((group) => <BuildingGroup key={group.building.name} group={group} />)
      ) : (
        <EmptyState
          icon="door-01"
          title={t(allClosed ? "results.closedTitle" : "results.emptyTitle")}
          text={
            allClosed
              ? t("results.closedText")
              : countActiveFilters(filters)
                ? t("results.emptyFiltered")
                : t("results.emptyText")
          }
        >
          {countActiveFilters(filters) > 0 && (
            <Button variant="ghost" className={emptyStateAction} onClick={resetFilters}>
              <StableText k="filters.resetAll" />
            </Button>
          )}
        </EmptyState>
      )}
    </div>
  );
}

const resultsList = "flex flex-col gap-5 px-gutter pt-3 pb-8 lg:px-5";

export function Results({ className }: { className?: string }) {
  useLocale();
  const all = useAvailability();
  const filters = useStore((state) => state.filters);
  const results = useMemo(() => visibleResults(all, filters), [all, filters]);
  const view = useStore((state) => state.view);

  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col border-t border-border bg-surface",
        "lg:overflow-clip lg:rounded-lg lg:border",
        className,
      )}
      aria-label={t("results.title")}
    >
      <div
        className={cn(
          "relative z-2 flex items-center gap-3 border-b border-border px-gutter py-2.5 max-sm:py-1.5 lg:px-5",
          // List view: the toolbar sits outside the scroller, so its shadow can cover the
          // scrollport's top edge. Some browsers round the stuck building header a few
          // pixels below that edge (fractional display scaling), leaving a sliver of card
          // photos between the toolbar and the header. Only header padding sits there.
          view === "list" && "shadow-[0_8px_0_var(--color-surface)]",
        )}
      >
        <Summary results={all} />
        <ViewSwitch />
      </div>
      <DataNotice />
      <div
        className={cn(
          "relative min-h-0 flex-1",
          view === "list"
            ? "overflow-y-auto overscroll-contain max-[600px]:scrollbar-none"
            : "flex",
        )}
      >
        {view === "list" ? (
          <ResultsList all={all} results={results} />
        ) : (
          <Suspense fallback={<div className="flex-1 bg-surface-muted" />}>
            <CampusMap results={results} />
          </Suspense>
        )}
      </div>
    </section>
  );
}
