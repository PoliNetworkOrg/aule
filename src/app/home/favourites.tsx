import { useSyncExternalStore } from "react";
import { cn } from "../../lib/cn";
import { t, tf, useLocale } from "../i18n";
import { getFavouriteIds, toggleFavourite } from "../utils/favourites";
import { findClassroom, roomWindowStatus } from "../state/availability";
import { openClassroom } from "../state/navigation-context";
import { useStore } from "../state/store";
import { Icon } from "../ui/icon";
import { pressable } from "../ui/motion";
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
      className={cn(
        // Divided from the panel above.
        "border-t border-t-border pt-3",
        // No favourites yet: title and hint share one line instead of a full panel.
        !entries.length &&
          "flex-row flex-wrap items-baseline gap-x-2.5 gap-y-0.5 lg:gap-x-2.5 lg:gap-y-0.5",
        hiddenByMoreFilters,
      )}
      aria-labelledby="favourites-title"
    >
      <PanelHeader className={cn(!entries.length && "min-h-0")}>
        <PanelTitle id="favourites-title">
          <Icon name="star" />
          {t("favourites.title")}
        </PanelTitle>
      </PanelHeader>
      {entries.length ? (
        <ul className="flex flex-wrap gap-2">
          {entries.map((entry) => {
            const availability = date ? roomWindowStatus(entry.room.id, date, from, to) : null;
            const status = availability?.status ?? "unknown";

            return (
              <li
                key={entry.room.id}
                className="flex items-stretch overflow-hidden rounded-md border border-border bg-surface transition-[border-color] hover:border-accent-soft-border"
              >
                <button
                  type="button"
                  className={cn(
                    "grid grid-cols-[auto_1fr] items-center gap-x-2 py-1.5 pr-1 pl-3 text-left transition-[scale]",
                    pressable,
                  )}
                  onClick={() =>
                    openClassroom(entry, date ? { date, from, to, highlight: false } : null)
                  }
                >
                  <StatusDot status={status} className="row-[1/3]" />
                  <span className="font-bold">{entry.room.name}</span>
                  <span className="col-start-2 text-12 text-muted">
                    {t("building.prefix")} {entry.building.name} · {entry.campus.name}
                  </span>
                  <span className="sr-only">
                    {availability ? t(`status.${availability.status}`) : ""}
                  </span>
                </button>
                <button
                  type="button"
                  className="grid w-8.5 place-items-center text-subtle transition-[background-color,color] hover:bg-busy-soft hover:text-busy"
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
        <p className="text-13 text-muted">{t("favourites.empty")}</p>
      )}
    </Panel>
  );
}
