import { useSyncExternalStore } from "react";
import { t, tf, useLocale } from "../i18n";
import { isFavourite, toggleFavourite } from "../utils/favourites";
import type { FreeSlot, RoomAvailability, WindowStatus } from "../state/availability";
import { findClassroom } from "../state/availability";
import { openClassroom } from "../state/navigation-context";
import { formatRange } from "../state/time";
import { cn } from "../../lib/cn";
import { Icon } from "../ui/icon";
import { Tag } from "../ui/tag";
import { RoomThumbnail } from "./room-thumbnail";

/** The grid of room cards (results list, loading skeleton, map panel). */
export const roomGrid =
  "grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2 lg:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]";

function subscribeFavourites(listener: () => void) {
  window.addEventListener("favourites-changed", listener);

  return () => window.removeEventListener("favourites-changed", listener);
}

export function useIsFavourite(id: number) {
  return useSyncExternalStore(subscribeFavourites, () => isFavourite(id));
}

export function FavouriteButton({
  id,
  name,
  className,
}: {
  id: number;
  name: string;
  className?: string;
}) {
  useLocale();
  const active = useIsFavourite(id);
  const label = tf(active ? "favourites.remove" : "favourites.add", { name });

  return (
    <button
      type="button"
      // The hover colour also wins over the active star's colour.
      className={cn(
        "grid size-9 place-items-center rounded-md text-subtle transition-[color,background-color]",
        "hover:bg-surface-muted hover:text-foreground",
        active && "text-star",
        className,
      )}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={() => toggleFavourite(id)}
    >
      <svg
        className={cn(
          "size-5 stroke-current stroke-[1.7] [stroke-linejoin:round]",
          active ? "fill-current" : "[fill:none]",
        )}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
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
  className,
}: {
  status: WindowStatus;
  slots: FreeSlot[];
  compact?: boolean;
  className?: string;
}) {
  useLocale();

  if (status === "closed")
    return (
      <Tag tone="closed" className={className}>
        {t("status.closed")}
      </Tag>
    );

  if (status === "occupied")
    return (
      <Tag tone="occupied" className={className}>
        {t("status.occupied")}
      </Tag>
    );

  if (status === "free")
    return (
      <Tag tone="free" className={className}>
        {t("status.free")}
      </Tag>
    );

  const [first, ...rest] = slots;

  return (
    <Tag
      tone="partial"
      className={className}
      title={slots.map((slot) => formatRange(slot.start, slot.end)).join(", ")}
    >
      {compact ? t("status.partial") : formatRange(first.start, first.end)}
      {!compact && rest.length > 0 && <span className="opacity-75">+{rest.length}</span>}
    </Tag>
  );
}

function hasFeature(room: RoomAvailability["room"], id: number) {
  return (room.features ?? []).some((feature) => feature.id === id);
}

const metaItem = "inline-flex items-center gap-[3px]";

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
    <li className="relative">
      <button
        type="button"
        className={cn(
          "flex size-full flex-col items-start gap-1 overflow-hidden rounded-md border border-border bg-surface px-3 pt-2.5 pb-3 text-left",
          "transition-[border-color,background-color] hover:border-accent-soft-border",
          "hover:bg-[color-mix(in_srgb,var(--color-accent-soft)_50%,var(--color-surface))]",
        )}
        onClick={() => entry && openClassroom(entry, { date, from, to, highlight: false })}
      >
        <RoomThumbnail
          id={room.id}
          idfoto={room.idfoto}
          className="-mx-3 -mt-2.5 mb-1.5 h-[88px] w-[calc(100%+24px)]"
        />
        {/* Without a thumbnail, keep the content bottom-aligned with photo cards in the same row. */}
        <span
          className="max-w-full truncate pr-8 text-17 font-bold tracking-tight tabular-nums first:mt-auto"
          title={room.name}
        >
          {room.name}
        </span>
        <span className="flex min-h-[18px] items-center gap-2.5 text-13 text-muted">
          {room.seats ? (
            <span className={metaItem}>
              <Icon name="user-multiple" />
              {room.seats}
            </span>
          ) : null}
          {hasFeature(room, 142) && (
            <span className={metaItem} title={t("features.sockets")}>
              <Icon name="plug-socket" />
              <span className="sr-only">{t("features.sockets")}</span>
            </span>
          )}
          {room.accessible_seats ? (
            <span className={metaItem} title={t("features.accessible")}>
              <Icon name="wheelchair" />
              <span className="sr-only">{t("features.accessible")}</span>
            </span>
          ) : null}
        </span>
        <StatusTag status={status} slots={slots} className="mt-1" />
      </button>
      <FavouriteButton id={room.id} name={room.name} className="absolute top-1 right-1" />
    </li>
  );
}
