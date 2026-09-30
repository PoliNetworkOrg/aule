import { t, tf, useLocale } from "../i18n";
import { capitalise, formatRange, parseIsoDate, romeTodayIso } from "../state/time";
import { Icon } from "../ui/icon";
import { countActiveFilters, setControlsCollapsed, useStore } from "../state/store";
import { Favourites } from "./favourites";
import { Filters } from "./filters";
import { Results } from "./results";
import { SearchBar } from "./search-bar";
import { SearchResults } from "./search-results";
import { WhenPanel } from "./when-controls";
import { WherePanel } from "./where-panel";
import { useVisibleResults } from "./results";
import { countRooms, findCampus } from "../state/availability";

/** Phones/tablets: the folded controls, as "Today · 12:00–14:00 · 2 filters". */
function ControlsSummary() {
  const locale = useLocale();
  const collapsed = useStore((state) => state.controlsCollapsed);
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const filters = useStore((state) => state.filters);
  const active = countActiveFilters(filters);
  const campus = findCampus(useStore((state) => state.campusId));

  // Weekday and day formatted apart: en-US would otherwise order them "30 Wed".
  const day =
    date === romeTodayIso()
      ? t("when.today")
      : date
        ? capitalise(
            `${new Intl.DateTimeFormat(locale, { weekday: "short" }).format(parseIsoDate(date))} ${parseIsoDate(date).getDate()}`,
            locale,
          )
        : "";

  return (
    <button
      type="button"
      className="controls-summary"
      hidden={!collapsed}
      aria-expanded={!collapsed}
      onClick={() => setControlsCollapsed(false)}
    >
      <Icon name="search-01" />
      <span className="controls-summary__text">
        <strong>{campus?.name}</strong> · {day} · {formatRange(from, to)}
        {active > 0 && (
          <> · {tf(active === 1 ? "filters.oneActive" : "filters.active", { n: active })}</>
        )}
      </span>
      <span className="controls-summary__edit">
        {t("filters.edit")}
        <Icon name="arrow-down-01" />
      </span>
    </button>
  );
}

/** Phones/tablets: closes the parameters and shows the matching rooms. */
function ShowResultsButton() {
  useLocale();
  const count = countRooms(useVisibleResults());
  const loading = useStore((state) => state.occupancy === "loading");

  return (
    <div className="controls__cta">
      <button
        type="button"
        className="button button--primary button--large"
        onClick={() => setControlsCollapsed(true)}
      >
        {loading
          ? t("results.loading")
          : count === 0
            ? t("results.showNone")
            : count === 1
              ? t("results.showOneResult")
              : tf("results.showResults", { n: count })}
        <Icon name="arrow-right-02" />
      </button>
    </div>
  );
}

export function HomePage({ hidden }: { hidden: boolean }) {
  useLocale();
  const searching = useStore((state) => state.query.trim() !== "");
  const collapsed = useStore((state) => state.controlsCollapsed);

  return (
    <main className={`home ${collapsed ? "home--results" : "home--form"}`} hidden={hidden}>
      <div className="home__search">
        <SearchBar />
      </div>
      {searching ? (
        <SearchResults />
      ) : (
        <div className="home__body">
          <ControlsSummary />
          <aside className="home__controls" aria-label={t("controls.label")}>
            <div className="controls__header">
              <span className="controls__title">{t("controls.label")}</span>
              <button
                type="button"
                className="icon-button controls__close"
                aria-label={t("controls.close")}
                title={t("controls.close")}
                onClick={() => setControlsCollapsed(true)}
              >
                <Icon name="cancel-01" />
              </button>
            </div>
            <WherePanel />
            <WhenPanel />
            <Filters />
            <Favourites />
            <ShowResultsButton />
          </aside>
          <Results />
        </div>
      )}
    </main>
  );
}
