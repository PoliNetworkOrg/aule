import { cn } from "../../lib/cn";
import { t, tf, useLocale } from "../i18n";
import { capitalise, formatRange, parseIsoDate, romeTodayIso } from "../state/time";
import { Button, IconButton } from "../ui/button";
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
import { countRooms } from "../state/availability";
import { campusSelectionLabel } from "./campus-label";

/** Phones/tablets: the folded controls, as "Today · 12:00–14:00 · 2 filters". */
function ControlsSummary() {
  const locale = useLocale();
  const collapsed = useStore((state) => state.controlsCollapsed);
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const filters = useStore((state) => state.filters);
  const active = countActiveFilters(filters);
  const campusIds = useStore((state) => state.campusIds);

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
      // Phones and tablets only (and `hidden` while the controls are open), as
      // compact as the search bar above it (see search-bar.tsx). Muted, unlike
      // the white search field: a summary, not an input.
      className={cn(
        "hidden icon:text-accent max-lg:mx-gutter max-lg:my-2 max-lg:flex max-lg:h-10 max-lg:items-center max-lg:gap-2.5",
        "max-lg:rounded-lg max-lg:border max-lg:border-border max-lg:bg-surface-muted max-lg:px-3.5 max-lg:text-left max-lg:text-14",
      )}
      hidden={!collapsed}
      aria-expanded={!collapsed}
      onClick={() => setControlsCollapsed(false)}
    >
      <Icon name="filter-horizontal" />
      <span className="min-w-0 flex-1 truncate tabular-nums">
        <strong>{campusSelectionLabel(campusIds).title}</strong> · {day} · {formatRange(from, to)}
        {active > 0 && (
          <> · {tf(active === 1 ? "filters.oneActive" : "filters.active", { n: active })}</>
        )}
      </span>
      <span className="inline-flex items-center gap-1 text-13 font-bold text-accent-strong">
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
    <div
      // Attached to the bottom of the screen: pushed down by mt-auto when the
      // parameters are shorter than the screen, stuck there when they scroll.
      // Solid with a top edge, like the header: a short fade only let a thin
      // line of the scrolling content show through above the button.
      className={cn(
        "hidden max-lg:sticky max-lg:bottom-0 max-lg:-mx-gutter max-lg:mt-auto max-lg:block",
        "max-lg:px-gutter max-lg:pt-3 max-lg:pb-[calc(12px+env(safe-area-inset-bottom))]",
        "max-lg:border-t max-lg:border-t-border max-lg:bg-background",
      )}
    >
      <Button size="large" onClick={() => setControlsCollapsed(true)}>
        {loading
          ? t("results.loading")
          : count === 0
            ? t("results.showNone")
            : count === 1
              ? t("results.showOneResult")
              : tf("results.showResults", { n: count })}
        <Icon name="arrow-right-02" />
      </Button>
    </div>
  );
}

export function HomePage({ hidden }: { hidden: boolean }) {
  useLocale();
  const searching = useStore((state) => state.query.trim() !== "");
  const collapsed = useStore((state) => state.controlsCollapsed);

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-content flex-1 flex-col" hidden={hidden}>
      <div className="px-gutter pt-3.5 lg:pt-5">
        <SearchBar />
      </div>
      {searching ? (
        <SearchResults />
      ) : (
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            "lg:grid lg:grid-cols-[384px_minmax(0,1fr)] lg:gap-9 lg:px-gutter lg:py-6",
            // Very short viewports (landscape phones): the page scrolls instead of squeezing results.
            "max-lg:short:flex-none max-lg:short:overflow-visible",
          )}
        >
          <ControlsSummary />
          <aside
            className={cn(
              "group/controls flex flex-none flex-col gap-3 px-gutter pt-3 pb-4.5 max-[600px]:scrollbar-none",
              // Phones and tablets: two steps. First the parameters, full screen, with a
              // button to see the rooms; then the rooms, with a summary to edit them.
              collapsed
                ? "max-lg:hidden"
                : // The "Show n rooms" bar reaches the bottom edge itself, safe area included.
                  "max-lg:min-h-0 max-lg:flex-1 max-lg:gap-4 max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:pt-4 max-lg:pb-0",
              // The inline padding leaves room for the range handles (and their focus
              // rings), which overhang the track at the ends of the day.
              "lg:-mx-4 lg:-mt-1 lg:gap-3 lg:overflow-y-auto lg:px-4 lg:pt-1 lg:pb-4 lg:[scrollbar-width:thin]",
            )}
            aria-label={t("controls.label")}
          >
            {/* Pinned with its own top spacing, so it never slides up against the search
                bar: sticky offsets start inside the 16px top padding, and the 60px are
                20px of spacing plus the 40px row. */}
            <div className="hidden max-lg:sticky max-lg:-top-4 max-lg:z-2 max-lg:-mt-4 max-lg:flex max-lg:min-h-15 max-lg:items-center max-lg:justify-between max-lg:gap-3 max-lg:bg-background max-lg:pt-5">
              <span className="text-13 font-bold text-muted">{t("controls.label")}</span>
              <IconButton
                className="flex-none"
                aria-label={t("controls.close")}
                title={t("controls.close")}
                onClick={() => setControlsCollapsed(true)}
              >
                <Icon name="cancel-01" />
              </IconButton>
            </div>
            <WherePanel />
            <WhenPanel />
            <Filters />
            <Favourites />
            <ShowResultsButton />
          </aside>
          <Results className={collapsed ? undefined : "max-lg:hidden"} />
        </div>
      )}
    </main>
  );
}
