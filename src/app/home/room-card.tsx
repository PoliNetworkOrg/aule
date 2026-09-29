import { useSyncExternalStore } from "react";
import { t, tf, useLocale } from "../i18n";
import { isFavourite, toggleFavourite } from "../utils/favourites";
import type { FreeSlot, RoomAvailability, WindowStatus } from "../state/availability";
import { findClassroom } from "../state/availability";
import { openClassroom } from "../state/navigation-context";
import { formatRange } from "../state/time";
import { Icon } from "../ui/icon";

function subscribeFavourites(listener: () => void) {
  window.addEventListener("favourites-changed", listener);

  return () => window.removeEventListener("favourites-changed", listener);
}

export function useIsFavourite(id: number) {
  return useSyncExternalStore(subscribeFavourites, () => isFavourite(id));
}

export function FavouriteButton({ id, name }: { id: number; name: string }) {
  useLocale();
  const active = useIsFavourite(id);
  const label = tf(active ? "favourites.remove" : "favourites.add", { name });

  return (
    <button
      type="button"
      className={`star-button${active ? " star-button--active" : ""}`}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={() => toggleFavourite(id)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 9.6l6-.9z" />
      </svg>
    </button>
  );
}

/** "Free", or the free sub-intervals of the searched window for partially free rooms. */
export function StatusTag({
  status,
  slots,
  compact = false,
}: {
  status: WindowStatus;
  slots: FreeSlot[];
  compact?: boolean;
}) {
  useLocale();

  if (status === "closed") return <span className="tag tag--closed">{t("status.closed")}</span>;

  if (status === "occupied")
    return <span className="tag tag--occupied">{t("status.occupied")}</span>;

  if (status === "free") return <span className="tag tag--free">{t("status.free")}</span>;

  const [first, ...rest] = slots;

  return (
    <span
      className="tag tag--partial"
      title={slots.map((slot) => formatRange(slot.start, slot.end)).join(", ")}
    >
      {compact ? t("status.partial") : formatRange(first.start, first.end)}
      {!compact && rest.length > 0 && <span className="tag__more">+{rest.length}</span>}
    </span>
  );
}

function hasFeature(room: RoomAvailability["room"], id: number) {
  return (room.features ?? []).some((feature) => feature.id === id);
}

export function RoomCard({
  result,
  date,
  from,
  to,
}: {
  result: RoomAvailability;
  date: string;
  from: string;
  to: string;
}) {
  useLocale();
  const { room, status, slots } = result;
  const entry = findClassroom(room.id);

  return (
    <li className={`room-card room-card--${status}`}>
      <button
        type="button"
        className="room-card__main"
        onClick={() => entry && openClassroom(entry, { date, from, to, highlight: false })}
      >
        <span className="room-card__name" title={room.name}>
          {room.name}
        </span>
        <span className="room-card__meta">
          {room.seats ? (
            <span>
              <Icon name="user-multiple" />
              {room.seats}
            </span>
          ) : null}
          {hasFeature(room, 142) && (
            <span title={t("features.sockets")}>
              <Icon name="plug-socket" />
              <span className="visually-hidden">{t("features.sockets")}</span>
            </span>
          )}
          {room.accessible_seats ? (
            <span title={t("features.accessible")}>
              <Icon name="wheelchair" />
              <span className="visually-hidden">{t("features.accessible")}</span>
            </span>
          ) : null}
        </span>
        <StatusTag status={status} slots={slots} />
      </button>
      <FavouriteButton id={room.id} name={room.name} />
    </li>
  );
}
