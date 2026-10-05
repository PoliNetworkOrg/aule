import { useSyncExternalStore } from "react";
import { t, tf, useLocale } from "../i18n";
import { isFavourite, toggleFavourite } from "../utils/favourites";
import type { FreeSlot, RoomAvailability, WindowStatus } from "../state/availability";
import { findClassroom } from "../state/availability";
import { openClassroom } from "../state/navigation-context";
import { formatRange, formatTime } from "../state/time";
import { cn } from "../../lib/cn";
import { Icon } from "../ui/icon";
import { pressableLarge } from "../ui/motion";
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
          // Transparent rather than none, so the fill can fade in with the colour.
          "size-5 fill-transparent stroke-current stroke-[1.7] transition-[fill] [stroke-linejoin:round]",
          active && "fill-current",
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
  until,
  compact = false,
  className,
}: {
  status: WindowStatus;
  slots: FreeSlot[];
  /** Free rooms: when they stop being free, shown instead of a bare "Free". */
  until?: string;
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

  if (status === "unknown")
    return (
      <Tag tone="closed" className={className}>
        {t("status.unknown")}
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
        {until && !compact ? tf("status.freeUntil", { time: formatTime(until) }) : t("status.free")}
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
  layout = "card",
}: {
  result: RoomAvailability;
  date: string;
  from: string;
  to: string;
  /**
   * "row" (the map's side panel): from tablets up, one room per row with the
   * thumbnail beside the name, as in search results, instead of a single
   * column of tall photo cards.
   */
  layout?: "card" | "row";
}) {
  useLocale();
  const { room, status, slots, freeUntil } = result;
  const entry = findClassroom(room.id);
  const row = layout === "row";

  return (
    <li className="relative">
      <button
        type="button"
        className={cn(
          "group/card flex size-full flex-col items-start gap-1 overflow-hidden rounded-md border border-border bg-surface px-3 pt-2.5 pb-3 text-left",
          "transition-[border-color,background-color,scale] hover:border-accent-soft-border",
          "hover:bg-[color-mix(in_srgb,var(--color-accent-soft)_50%,var(--color-surface))]",
          pressableLarge,
          row && [
            "md:grid md:min-h-16 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-3 md:gap-y-0.5 md:py-2 md:pr-12 md:pl-3",
            "md:has-data-[slot=thumbnail]:grid-cols-[56px_minmax(0,1fr)_auto] md:has-data-[slot=thumbnail]:pl-2",
          ],
        )}
        onClick={() => entry && openClassroom(entry, { date, from, to, highlight: false })}
      >
        <RoomThumbnail
          id={room.id}
          idfoto={room.idfoto}
          className={cn(
            "-mx-3 -mt-2.5 mb-1.5 h-[88px] w-[calc(100%+24px)]",
            row && "md:col-start-1 md:row-span-2 md:row-start-1 md:m-0 md:size-14 md:rounded-sm",
          )}
        />
        <span
          className={cn(
            "max-w-full truncate pr-8 text-17 font-bold tracking-tight tabular-nums",
            row && "md:pr-0 md:group-has-data-[slot=thumbnail]/card:col-start-2",
          )}
          title={room.name}
        >
          {room.name}
        </span>
        <span
          className={cn(
            "flex min-h-[18px] items-center gap-2.5 text-13 text-muted",
            row && "md:group-has-data-[slot=thumbnail]/card:col-start-2",
          )}
        >
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
        <StatusTag
          status={status}
          slots={slots}
          until={freeUntil}
          className={cn("mt-1", row && "md:col-start-[-2] md:row-span-2 md:row-start-1 md:mt-0")}
        />
      </button>
      <FavouriteButton
        id={room.id}
        name={room.name}
        className={cn(
          // Sits on the photo when there is one: a surface pill keeps it legible on any image.
          "absolute top-1.5 right-1.5 size-8 bg-surface/88 shadow-sm hover:bg-surface",
          // Off the photo in a row: a plain icon button, centred on the row.
          row &&
            "md:top-1/2 md:size-9 md:-translate-y-1/2 md:bg-transparent md:shadow-none md:hover:bg-surface-muted",
        )}
      />
    </li>
  );
}
