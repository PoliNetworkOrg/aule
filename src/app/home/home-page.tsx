import { t, tf, useLocale } from "../i18n";
import { capitalise, formatRange, parseIsoDate, romeTodayIso } from "../state/time";
import { Icon } from "../ui/icon";
import { StableText } from "../ui/stable";
import { countActiveFilters, setControlsCollapsed, useStore } from "../state/store";
import { Favourites } from "./favourites";
import { Filters } from "./filters";
import { Results } from "./results";
import { SearchBar } from "./search-bar";
import { SearchResults } from "./search-results";
import { WhenPanel } from "./when-controls";

/** Phones/tablets: the folded controls, as "Today · 12:00–14:00 · 2 filters". */
function ControlsSummary() {
  const locale = useLocale();
  const collapsed = useStore((state) => state.controlsCollapsed);
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const filters = useStore((state) => state.filters);
  const active = countActiveFilters(filters);

  const day =
    date === romeTodayIso()
      ? t("when.today")
      : date
        ? capitalise(
            new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" }).format(
              parseIsoDate(date),
            ),
            locale,
          )
        : "";

  return (
    <button
      type="button"
      className="controls-summary"
      hidden={!collapsed}
      aria-expanded={!collapsed}
      onClick={() => {
        setControlsCollapsed(false);
        document.querySelector(".results__body")?.scrollTo({ top: 0 });
      }}
    >
      <Icon name="calendar-03" />
      <span className="controls-summary__text">
        <strong>{day}</strong> · {formatRange(from, to)}
        {active > 0 && (
          <> · {tf(active === 1 ? "filters.oneActive" : "filters.active", { n: active })}</>
        )}
      </span>
      <span className="controls-summary__edit">
        <StableText k="filters.edit" />
        <Icon name="arrow-down-01" />
      </span>
    </button>
  );
}

export function HomePage({ hidden }: { hidden: boolean }) {
  useLocale();
  const searching = useStore((state) => state.query.trim() !== "");
  const collapsed = useStore((state) => state.controlsCollapsed);

  return (
    <main className="home" hidden={hidden}>
      <div className="home__search">
        <SearchBar />
      </div>
      {searching ? (
        <SearchResults />
      ) : (
        <div className="home__body">
          <ControlsSummary />
          <aside
            className={`home__controls${collapsed ? " home__controls--collapsed" : ""}`}
            aria-label={t("when.title")}
          >
            <WhenPanel />
            <Filters />
            <Favourites />
          </aside>
          <Results />
        </div>
      )}
    </main>
  );
}
