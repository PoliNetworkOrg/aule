import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { closePage } from "../../lib/navigation";
import { formatRomeHHMM } from "../available-rooms-script";
import { t, tf, useLocale } from "../i18n";
import {
  findClassroom,
  findClassroomBySlug,
  roomNowStatus,
  type ClassroomEntry,
} from "../state/availability";
import { leavePage, type ClassroomContext } from "../state/navigation-context";
import { useStore } from "../state/store";
import { formatTime, romeTodayIso } from "../state/time";
import { hasCoordinates } from "../map/maplibre";
import { fetchPhotoUrl } from "../utils/photo";
import { FavouriteButton } from "../home/room-card";
import { isNumber } from "../../lib/guards";
import { Icon } from "../ui/icon";
import { Schedule } from "./schedule";

const LocationMap = lazy(() => import("./location-map"));

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
    <p className={`now-status now-status--${status.state}`}>
      <span className="status-dot" aria-hidden="true" />
      <strong>{t(`now.${status.state}`)}</strong>
      {status.detail && (
        <span>
          {tf(`now.${status.detail}`, { time: status.time ? formatTime(status.time) : "" })}
        </span>
      )}
    </p>
  );
}

/**
 * Stands in for a missing or broken photo on desktop, where the card sits next
 * to the schedule: keeps the 16:9 slot so every room's card has the same shape.
 * Hidden on phones (see .room-photo--empty), where the card just starts lower.
 */
function PhotoPlaceholder() {
  return (
    <div className="room-photo room-photo--empty" aria-hidden="true">
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
        className={`room-photo room-photo--${state}`}
        aria-label={tf("classroom.enlargePhoto", { name: roomName })}
        disabled={!url || state !== "ready"}
        onClick={() => dialog.current?.showModal()}
      >
        {url && (
          <img
            src={url}
            alt=""
            decoding="async"
            onLoad={() => setState("ready")}
            onError={() => setState("failed")}
          />
        )}
        {state === "ready" && (
          <span className="room-photo__expand">
            <Icon name="full-screen" />
            {t("classroom.enlarge")}
          </span>
        )}
      </button>
      <dialog
        ref={dialog}
        className="room-photo-dialog"
        aria-label={tf("classroom.photoOf", { name: roomName })}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <button
          type="button"
          className="room-photo-dialog__close"
          aria-label={t("classroom.closePhoto")}
          onClick={() => dialog.current?.close()}
        >
          <Icon name="cancel-01" />
        </button>
        {url && (
          <button
            type="button"
            className="room-photo-dialog__image"
            aria-label={t("classroom.closePhoto")}
            onClick={() => dialog.current?.close()}
          >
            <img src={url} alt={tf("classroom.photoOf", { name: roomName })} />
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
    <section className="card location-card" aria-labelledby="location-title">
      <div className="location-card__header">
        <h2 className="panel__title" id="location-title">
          <Icon name="location-01" />
          {t("classroom.location")}
        </h2>
        <p className="location-card__place">
          <strong>{label}</strong>
          {building.address ? <span>{building.address}</span> : null}
        </p>
      </div>
      {point && (
        <Suspense fallback={<div className="location-map" />}>
          <LocationMap building={point} campusBuildings={campus.buildings} />
        </Suspense>
      )}
      <div className="button-row">
        <a
          className="button button--ghost location-card__link"
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="directions-01" />
          {t("classroom.directions")}
          <Icon name="arrow-up-right-01" className="location-card__external" />
        </a>
      </div>
    </section>
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
      <main className="page">
        {directory === "ready" ? (
          <div className="empty-state">
            <Icon name="door-01" className="empty-state__icon" />
            <p className="empty-state__title">{t("classroom.notFound")}</p>
            <button type="button" className="button button--primary" onClick={() => closePage()}>
              {t("classroom.backHome")}
            </button>
          </div>
        ) : (
          <div className="skeleton skeleton--page" />
        )}
      </main>
    );

  const { room, building } = entry;
  const features = (room.features ?? []).filter((feature) => FEATURES.has(feature.id));

  return (
    <main className="page">
      <button type="button" className="back-link" onClick={leavePage}>
        <Icon name="arrow-left-01" />
        {t("classroom.back")}
      </button>

      <div className="classroom-page__layout">
        <section className="card room-info" aria-labelledby="room-title">
          {room.idfoto ? (
            <Photo key={room.id} roomId={room.id} roomName={room.name} />
          ) : (
            <PhotoPlaceholder />
          )}
          <div className="room-info__body">
            <div className="room-info__title-row">
              <div>
                <h1 className="room-info__title" id="room-title">
                  {room.name}
                </h1>
                <p className="room-info__subtitle">
                  {t("building.prefix")} {building.name}
                  {building.altName ? ` · ${building.altName}` : ""} · {entry.campus.name}
                </p>
              </div>
              <FavouriteButton id={room.id} name={room.name} />
            </div>

            <NowStatus entry={entry} />

            {/* Icons label the values; the text stays for screen readers and as a tooltip. */}
            <dl className="room-stats">
              <div title={t("classroom.seats")}>
                <dt>
                  <Icon name="user-multiple" />
                  <span className="visually-hidden">{t("classroom.seats")}</span>
                </dt>
                <dd>{room.seats ?? "—"}</dd>
              </div>
              <div title={t("classroom.accessibleSeats")}>
                <dt>
                  <Icon name="wheelchair" />
                  <span className="visually-hidden">{t("classroom.accessibleSeats")}</span>
                </dt>
                <dd>{room.accessible_seats ?? 0}</dd>
              </div>
              {isNumber(room.floor) && (
                <div title={t("classroom.floor")}>
                  <dt>
                    <Icon name="stairs-01" />
                    <span className="visually-hidden">{t("classroom.floor")}</span>
                  </dt>
                  <dd>
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
              <ul className="feature-list" aria-label={t("classroom.features")}>
                {features.map((feature) => {
                  const meta = FEATURES.get(feature.id)!;

                  return (
                    <li key={feature.id} className="feature">
                      <Icon name={meta.icon} />
                      {t(meta.key)}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <div className="classroom-page__main">
          <section className="card schedule-card" aria-labelledby="schedule-title">
            <h2 className="panel__title" id="schedule-title">
              <Icon name="calendar-03" />
              {t("schedule.title")}
            </h2>
            <Schedule key={room.id} roomId={room.id} context={context} />
          </section>

          {(building.address || hasCoordinates(building)) && (
            <Location key={building.name} entry={entry} />
          )}
        </div>
      </div>
    </main>
  );
}
