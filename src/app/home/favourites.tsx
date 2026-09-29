import { useSyncExternalStore } from "react";
import { t, useLocale } from "../i18n";
import { getFavouriteIds } from "../utils/favourites";
import { findClassroom, roomWindowStatus } from "../state/availability";
import { openClassroom } from "../state/navigation-context";
import { useStore } from "../state/store";
import { Icon } from "../ui/icon";

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
    <section className={`favourites${entries.length ? "" : " favourites--empty"}`}>
      <h2 className="section-title">
        <Icon name="star" />
        {t("favourites.title")}
      </h2>
      {entries.length ? (
        <ul className="chip-row">
          {entries.map((entry) => {
            const availability = date ? roomWindowStatus(entry.room.id, date, from, to) : null;
            const status = availability?.status ?? "unknown";

            return (
              <li key={entry.room.id}>
                <button
                  type="button"
                  className="chip favourite-chip"
                  onClick={() =>
                    openClassroom(entry, date ? { date, from, to, highlight: false } : null)
                  }
                >
                  <span className={`status-dot status-dot--${status}`} aria-hidden="true" />
                  <span className="favourite-chip__name">{entry.room.name}</span>
                  <span className="favourite-chip__campus">{entry.campus.name}</span>
                  <span className="visually-hidden">
                    {availability ? t(`status.${availability.status}`) : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="favourites__hint">{t("favourites.empty")}</p>
      )}
    </section>
  );
}
