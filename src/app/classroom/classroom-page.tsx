import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { closePage } from "../../lib/navigation";
import { formatRomeHHMM } from "../available-rooms-script";
import { t, tf, useLocale } from "../i18n";
import {
  findClassroom,
  findClassroomBySlug,
  isUsuallyClosed,
  roomNowStatus,
  type ClassroomEntry,
} from "../state/availability";
import { leavePage, type ClassroomContext } from "../state/navigation-context";
import { useStore } from "../state/store";
import { formatTime, romeTodayIso } from "../state/time";
import { hasCoordinates } from "../map/maplibre";
import { fetchPhotoUrl } from "../utils/photo";
import { FavouriteButton } from "../home/room-card";
import { cn } from "../../lib/cn";
import { isNumber } from "../../lib/guards";
import { Button, buttonVariants } from "../ui/button";
import { Card } from "../ui/card";
import { EmptyState, emptyStateAction } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { PanelTitle } from "../ui/panel";
import { StatusDot } from "../ui/tag";
import { Schedule } from "./schedule";

const LocationMap = lazy(() => import("./location-map"));

const PAGE = "mx-auto w-full max-w-[1200px] px-gutter pt-3 pb-12";

/** The classroom's cards: schedule and location. */
const CONTENT_CARD = "flex min-w-0 flex-col gap-3.5 px-4.5 pt-4 pb-4.5";

// Firefox doesn't always clip the composited WebGL canvas to overflow +
// border-radius, so the frame clips itself explicitly as well.
const LOCATION_MAP_FRAME = cn(
  "relative isolate h-80 overflow-hidden rounded-md border border-border bg-surface-muted max-md:h-65",
  "[clip-path:inset(0_round_var(--radius-md))]",
);

const ROOM_STAT = "flex h-9 items-center justify-center gap-2 rounded-md bg-surface-muted px-1";

const FEATURES = new Map([
  [142, { icon: "plug-socket", key: "features.sockets" }],
  [143, { icon: "cable", key: "features.network" }],
  [4, { icon: "projector-01", key: "features.projector" }],
  [11, { icon: "projector-01", key: "features.projectorPc" }],
  [5, { icon: "mic-01", key: "features.radioMic" }],
  [104, { icon: "mic-01", key: "features.mic" }],
  [6, { icon: "blinds", key: "features.dimmable" }],
  [223, { icon: "computer-video-call", key: "features.videoconf" }],
]);

function useEntry(id?: string, campus?: string, name?: string) {
  useStore((state) => state.directory);

  if (id !== undefined) return /^\d+$/.test(id) ? findClassroom(Number(id)) : null;

  return campus && name ? findClassroomBySlug(campus, name) : null;
}

/** "Free now, until 14:15" / "Occupied now, free from 13:15" / "Closed now, opens at 8:00" for today. */
function NowStatus({ entry }: { entry: ClassroomEntry }) {
  useLocale();
  useStore((state) => state.dataRevision);

  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  const status = roomNowStatus(entry.room.id, romeTodayIso(), formatRomeHHMM(new Date()));

  if (!status) return null;

  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-3 py-2.5 text-14",
        status.state === "free" && "bg-free-soft text-free",
        status.state === "busy" && "bg-busy-soft text-busy",
        status.state === "closed" && "bg-surface-muted text-muted",
      )}
    >
      <StatusDot className="bg-current" />
      <strong>{t(`now.${status.state}`)}</strong>
      {status.detail && (
        <span className="text-foreground">
          {tf(`now.${status.detail}`, { time: status.time ? formatTime(status.time) : "" })}
        </span>
      )}
    </p>
  );
}

/** Events-only rooms: why the room never shows up among the free ones. */
function UsuallyClosedNote() {
  useLocale();

  return (
    <p
      className="flex items-start gap-2 rounded-md bg-surface-muted px-3 py-2.5 text-14 text-muted icon:mt-0.5"
      role="note"
    >
      <Icon name="information-circle" />
      <span>
        <strong className="text-foreground">{t("classroom.eventsOnlyTitle")}</strong>{" "}
        {t("classroom.eventsOnlyText")}
      </span>
    </p>
  );
}

/** The room card's 16:9 photo slot. */
const PHOTO_SLOT = "relative block aspect-video w-full overflow-hidden bg-surface-muted";

/**
 * Stands in for a missing or broken photo on desktop, where the card sits next
 * to the schedule: keeps the 16:9 slot so every room's card has the same shape.
 * Hidden on phones and tablets, where the card just starts lower.
 */
function PhotoPlaceholder() {
  return (
    <div
      className={cn(
        PHOTO_SLOT,
        "hidden flex-col items-center justify-center gap-1.5 text-13 text-muted lg:flex",
        "icon:text-28 icon:text-subtle",
      )}
      aria-hidden="true"
    >
      <Icon name="album-not-found-01" />
      <span>{t("classroom.noPhoto")}</span>
    </div>
  );
}

function Photo({ roomId, roomName }: { roomId: number; roomName: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let disposed = false;

    void fetchPhotoUrl(roomId).then((value) => !disposed && setUrl(value));

    return () => {
      disposed = true;
    };
  }, [roomId]);

  if (state === "failed") return <PhotoPlaceholder />;

  return (
    <>
      <button
        type="button"
        className={cn(PHOTO_SLOT, "text-left disabled:cursor-default")}
        aria-label={tf("classroom.enlargePhoto", { name: roomName })}
        disabled={!url || state !== "ready"}
        onClick={() => dialog.current?.showModal()}
      >
        {url && (
          <img
            className={cn(
              "size-full object-cover opacity-0 transition-opacity duration-250 ease-in-out",
              state === "ready" && "opacity-100",
            )}
            src={url}
            alt=""
            decoding="async"
            onLoad={() => setState("ready")}
            onError={() => setState("failed")}
          />
        )}
        {state === "ready" && (
          <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-md bg-scrim/82 px-2.5 py-[7px] text-13 font-bold text-white">
            <Icon name="full-screen" />
            {t("classroom.enlarge")}
          </span>
        )}
      </button>
      <dialog
        ref={dialog}
        className={cn(
          "fixed inset-0 h-[96dvh] max-h-none w-[min(98vw,1700px)] max-w-none overflow-visible border-0 bg-transparent p-0 backdrop:bg-scrim/88",
          // Closed state and close motion: quicker than the open, and display and
          // overlay stay discrete so the photo is still painted while it fades out.
          "scale-96 opacity-0 transition-[opacity,scale,display,overlay] transition-discrete duration-150 ease-smooth-out",
          "open:scale-100 open:opacity-100 open:duration-250 starting:open:scale-96 starting:open:opacity-0",
          "backdrop:opacity-0 backdrop:transition-[opacity,display,overlay] backdrop:transition-discrete backdrop:duration-150 backdrop:ease-smooth-out",
          "open:backdrop:opacity-100 open:backdrop:duration-250 starting:open:backdrop:opacity-0",
        )}
        aria-label={tf("classroom.photoOf", { name: roomName })}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <button
          type="button"
          className="absolute top-3 right-3 z-1 grid size-10 place-items-center rounded-md bg-scrim/82 text-white"
          aria-label={t("classroom.closePhoto")}
          onClick={() => dialog.current?.close()}
        >
          <Icon name="cancel-01" />
        </button>
        {url && (
          <button
            type="button"
            className="block size-full cursor-zoom-out"
            aria-label={t("classroom.closePhoto")}
            onClick={() => dialog.current?.close()}
          >
            <img
              className="block size-full object-contain"
              src={url}
              alt={tf("classroom.photoOf", { name: roomName })}
            />
          </button>
        )}
      </dialog>
    </>
  );
}

/** Where the building is: address, the location map and a directions link. */
function Location({ entry }: { entry: ClassroomEntry }) {
  useLocale();
  const { building, campus } = entry;
  const label = building.altName?.trim() || `${t("building.prefix")} ${building.name}`;
  const point = hasCoordinates(building) ? building : null;

  // A maps search on the building's coordinates (or, without them, its
  // address): opens the maps app on phones, ready to route there.
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    point ? `${point.lat},${point.long}` : (building.address ?? ""),
  )}`;

  return (
    <Card className={CONTENT_CARD} aria-labelledby="location-title">
      <div className="flex flex-col gap-1.5">
        <PanelTitle id="location-title">
          <Icon name="location-01" />
          {t("classroom.location")}
        </PanelTitle>
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-14 text-muted">
          <strong className="text-16 text-foreground">{label}</strong>
          {building.address ? <span>{building.address}</span> : null}
        </p>
      </div>
      {point && (
        <Suspense fallback={<div className={LOCATION_MAP_FRAME} />}>
          <LocationMap
            building={point}
            campusBuildings={campus.buildings}
            className={LOCATION_MAP_FRAME}
          />
        </Suspense>
      )}
      <div className="flex flex-wrap gap-2">
        <a
          className={buttonVariants({ variant: "ghost" })}
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="directions-01" className="text-18" />
          {t("classroom.directions")}
          <Icon name="arrow-up-right-01" className="text-14 text-subtle" />
        </a>
      </div>
    </Card>
  );
}

export function ClassroomPage({
  id,
  campus,
  name,
  context,
}: {
  id?: string;
  campus?: string;
  name?: string;
  context: ClassroomContext | null;
}) {
  useLocale();
  const entry = useEntry(id, campus, name);
  const directory = useStore((state) => state.directory);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [entry?.room.id]);

  useEffect(() => {
    if (entry) document.title = `${entry.room.name} · ${t("app.fullName")}`;

    return () => {
      document.title = t("app.fullName");
    };
  }, [entry]);

  if (!entry)
    return (
      <main className={PAGE}>
        {directory === "ready" ? (
          <EmptyState icon="door-01" title={t("classroom.notFound")}>
            <Button className={emptyStateAction} onClick={() => closePage()}>
              {t("classroom.backHome")}
            </Button>
          </EmptyState>
        ) : (
          // Skeleton's classes on a div, the element this placeholder has always been.
          <div className="mt-6 block h-80 animate-shimmer rounded-md bg-[linear-gradient(90deg,var(--color-surface-muted)_30%,var(--color-border)_50%,var(--color-surface-muted)_70%)] bg-size-[300%_100%]" />
        )}
      </main>
    );

  const { room, building } = entry;
  const features = (room.features ?? []).filter((feature) => FEATURES.has(feature.id));

  return (
    <main className={PAGE}>
      <button
        type="button"
        className="mb-2 -ml-1.5 inline-flex min-h-10 items-center gap-1.5 rounded-md pr-2.5 pl-1.5 text-14 font-semibold text-muted hover:bg-accent-soft hover:text-accent-strong"
        onClick={leavePage}
      >
        <Icon name="arrow-left-01" />
        {t("classroom.back")}
      </button>

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-6 lg:[align-items:start]">
        <Card
          className="overflow-hidden lg:sticky lg:top-[calc(var(--spacing-header)+16px)]"
          aria-labelledby="room-title"
        >
          {room.idfoto ? (
            <Photo key={room.id} roomId={room.id} roomName={room.name} />
          ) : (
            <PhotoPlaceholder />
          )}
          <div className="flex flex-col gap-4 px-4.5 pt-4 pb-4.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1
                  className="text-30 leading-[1.1] font-bold tracking-tighter max-xs:text-26"
                  id="room-title"
                >
                  {room.name}
                </h1>
                <p className="mt-1 text-muted">
                  {t("building.prefix")} {building.name}
                  {building.altName ? ` · ${building.altName}` : ""} · {entry.campus.name}
                </p>
              </div>
              <FavouriteButton id={room.id} name={room.name} />
            </div>

            <NowStatus entry={entry} />
            {isUsuallyClosed(entry) && <UsuallyClosedNote />}

            {/* Icons label the values; the text stays for screen readers and as a tooltip.
                Full width, one equal column per stat (two when the floor is unknown); a
                column only grows past its share when its content would not fit ("Ground"
                on the narrowest phones). There "Seminterrato" no longer fits beside the
                other two stats, so the floor takes its own row below them. */}
            <dl className="grid auto-cols-[minmax(max-content,1fr)] grid-flow-col gap-2 max-3xs:grid-flow-row max-3xs:grid-cols-2">
              <div className={ROOM_STAT} title={t("classroom.seats")}>
                <dt className="flex text-18 text-muted">
                  <Icon name="user-multiple" />
                  <span className="sr-only">{t("classroom.seats")}</span>
                </dt>
                <dd className="text-16 font-bold tabular-nums">{room.seats ?? "—"}</dd>
              </div>
              <div className={ROOM_STAT} title={t("classroom.accessibleSeats")}>
                <dt className="flex text-18 text-muted">
                  <Icon name="wheelchair" />
                  <span className="sr-only">{t("classroom.accessibleSeats")}</span>
                </dt>
                <dd className="text-16 font-bold tabular-nums">{room.accessible_seats ?? 0}</dd>
              </div>
              {isNumber(room.floor) && (
                <div
                  className={cn(ROOM_STAT, "max-3xs:col-span-full")}
                  title={t("classroom.floor")}
                >
                  <dt className="flex text-18 text-muted">
                    <Icon name="stairs-01" />
                    <span className="sr-only">{t("classroom.floor")}</span>
                  </dt>
                  <dd className="text-16 font-bold tabular-nums">
                    {room.floor === 0
                      ? t("classroom.groundFloor")
                      : room.floor === -1
                        ? t("classroom.basementFloor")
                        : room.floor}
                  </dd>
                </div>
              )}
            </dl>

            {features.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label={t("classroom.features")}>
                {features.map((feature) => {
                  const meta = FEATURES.get(feature.id)!;

                  return (
                    <li
                      key={feature.id}
                      className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-border px-2.5 text-13 icon:text-accent"
                    >
                      <Icon name={meta.icon} />
                      {t(meta.key)}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        <div className="grid min-w-0 gap-4 lg:gap-6">
          <Card className={CONTENT_CARD} aria-labelledby="schedule-title">
            <PanelTitle id="schedule-title">
              <Icon name="calendar-03" />
              {t("schedule.title")}
            </PanelTitle>
            <Schedule key={room.id} roomId={room.id} context={context} />
          </Card>

          {(building.address || hasCoordinates(building)) && (
            <Location key={building.name} entry={entry} />
          )}
        </div>
      </div>
    </main>
  );
}
