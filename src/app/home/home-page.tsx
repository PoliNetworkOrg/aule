import { t, useLocale } from "../i18n";
import { useStore } from "../state/store";
import { Favourites } from "./favourites";
import { Filters } from "./filters";
import { Results } from "./results";
import { SearchBar } from "./search-bar";
import { SearchResults } from "./search-results";
import { DateStrip, TimeRange } from "./when-controls";

export function HomePage({ hidden }: { hidden: boolean }) {
  useLocale();
  const searching = useStore((state) => state.query.trim() !== "");

  return (
    <main className="home" hidden={hidden}>
      <div className="home__search">
        <SearchBar />
      </div>
      {searching ? (
        <SearchResults />
      ) : (
        <div className="home__body">
          <aside className="home__controls" aria-label={t("when.title")}>
            <section className="panel">
              <h2 className="section-title visually-hidden-mobile">{t("when.title")}</h2>
              <DateStrip />
              <TimeRange />
            </section>
            <section className="panel">
              <h2 className="section-title visually-hidden-mobile">{t("filters.title")}</h2>
              <Filters />
            </section>
            <Favourites />
          </aside>
          <Results />
        </div>
      )}
    </main>
  );
}
