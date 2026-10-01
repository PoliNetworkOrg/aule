import { useSyncExternalStore } from "react";
import { cn } from "../../lib/cn";
import { t, tf, useLocale } from "../i18n";
import { getFavouriteIds, toggleFavourite } from "../utils/favourites";
import { findClassroom, roomWindowStatus } from "../state/availability";
import { openClassroom } from "../state/navigation-context";
import { useStore } from "../state/store";
import { Icon } from "../ui/icon";
import { Panel, PanelHeader, PanelTitle } from "../ui/panel";
import { StatusDot } from "../ui/tag";
import { hiddenByMoreFilters } from "./filters";

function subscribe(listener: () => void) {
  window.addEventListener("favourites-changed", listener);

  return () => window.removeEventListener("favourites-changed", listener);
}

export function Favourites() {
  useLocale();
  const ids = useSyncExternalStore(subscribe, () => getFavouriteIds().join(","));
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);

  useStore((state) => state.dataRevision);
  useStore((state) => state.directory);

  const entries = ids
    .split(",")
    .filter(Boolean)
    .flatMap((id) => {
      const entry = findClassroom(Number(id));

      return entry ? [entry] : [];
    });

  return (
    <Panel
      // Divided from the panel above.
      className={cn("border-t border-t-border pt-3", hiddenByMoreFilters)}
      aria-labelledby="favourites-title"
    >
      <PanelHeader>
        <PanelTitle id="favourites-title">
          <Icon name="star" />
          {t("favourites.title")}
        </PanelTitle>
      </PanelHeader>
      {entries.length ? (
        // Desktop: two per row in the narrow sidebar, where natural-width chips would
        // wrap one per line; the labels truncate instead.
        <ul className="flex flex-wrap gap-2 lg:grid lg:grid-cols-2">
          {entries.map((entry) => {
            const availability = date ? roomWindowStatus(entry.room.id, date, from, to) : null;
            const status = availability?.status ?? "unknown";

            return (
              <li
                key={entry.room.id}
                className="flex min-w-0 items-stretch overflow-hidden rounded-md border border-border bg-surface hover:border-accent-soft-border"
              >
                <button
                  type="button"
                  className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 py-1.5 pr-1 pl-3 text-left"
                  title={`${entry.room.name} · ${t("building.prefix")} ${entry.building.name} · ${entry.campus.name}`}
                  onClick={() =>
                    openClassroom(entry, date ? { date, from, to, highlight: false } : null)
                  }
                >
                  <StatusDot status={status} className="row-[1/3]" />
                  <span className="truncate font-bold">{entry.room.name}</span>
                  <span className="col-start-2 truncate text-12 text-muted">
                    {t("building.prefix")} {entry.building.name} · {entry.campus.name}
                  </span>
                  <span className="sr-only">
                    {availability ? t(`status.${availability.status}`) : ""}
                  </span>
                </button>
                <button
                  type="button"
                  className="grid w-8.5 place-items-center text-subtle hover:bg-busy-soft hover:text-busy"
                  aria-label={tf("favourites.remove", { name: entry.room.name })}
                  title={tf("favourites.remove", { name: entry.room.name })}
                  onClick={() => toggleFavourite(entry.room.id)}
                >
                  <Icon name="cancel-01" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-14 text-muted">{t("favourites.empty")}</p>
      )}
    </Panel>
  );
}
