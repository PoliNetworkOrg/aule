import { useEffect, useState } from "react";
import { closePage, goBack } from "../../lib/navigation";
import { getClassroomStatusNow } from "../available-rooms-script";
import { t, tf, useLocale } from "../i18n";
import {
  findClassroom,
  findClassroomBySlug,
  roomOccupancy,
  type ClassroomEntry,
} from "../state/availability";
import { cameFromApp, type ClassroomContext } from "../state/navigation-context";
import { useStore } from "../state/store";
import { formatTime, romeTodayIso } from "../state/time";
import { fetchPhotoUrl } from "../utils/photo";
import { FavouriteButton } from "../home/room-card";
import { Icon } from "../ui/icon";
import { Schedule } from "./schedule";

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

/** "Free until 14:15" / "Busy, free from 13:15" for today. */
function NowStatus({ entry }: { entry: ClassroomEntry }) {
  useLocale();
  useStore((state) => state.dataRevision);

  const status = getClassroomStatusNow(entry.room.id);
  const occupancy = roomOccupancy(entry.room.id, romeTodayIso());

  if (!status || !occupancy) return null;

  const now = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Rome",
  }).format(new Date());

  const sorted = [...occupancy].sort((a, b) => a.inizio.localeCompare(b.inizio));
  const busy = sorted.find((slot) => slot.inizio <= now && slot.fine > now);
  let detail = "";

  if (busy) {
    let end = busy.fine;

    for (const slot of sorted) if (slot.inizio <= end && slot.fine > end) end = slot.fine;

    detail = tf("now.freeFrom", { time: formatTime(end) });
  } else {
    const next = sorted.find((slot) => slot.inizio > now);

    detail = next ? tf("now.freeUntil", { time: formatTime(next.inizio) }) : t("now.freeRestOfDay");
  }

  const free = status === "free" || status === "occupied-soon";

  return (
    <p className={`now-status now-status--${free ? "free" : "busy"}`}>
      <span className="status-dot" aria-hidden="true" />
      <strong>{t(free ? "now.free" : "now.busy")}</strong>
      <span>{detail}</span>
    </p>
  );
}

function Photo({ roomId }: { roomId: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let disposed = false;

    void fetchPhotoUrl(roomId).then((value) => !disposed && setUrl(value));

    return () => {
      disposed = true;
    };
  }, [roomId]);

  if (state === "failed") return null;

  return (
    <div className={`room-photo room-photo--${state}`}>
      {url && (
        <img
          src={url}
          alt=""
          decoding="async"
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
        />
      )}
    </div>
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

  function back() {
    if (cameFromApp()) goBack();
    else closePage();
  }

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

  const mapsUrl =
    building.lat !== undefined && building.long !== undefined
      ? `https://www.google.com/maps/search/?api=1&query=${building.lat},${building.long}`
      : null;

  return (
    <main className="page">
      <button type="button" className="back-link" onClick={back}>
        <Icon name="arrow-left-01" />
        {t("classroom.back")}
      </button>

      <div className="classroom-page__layout">
        <section className="card room-info" aria-labelledby="room-title">
          {room.idfoto ? <Photo roomId={room.id} /> : null}
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

            <dl className="room-stats">
              <div>
                <dt>{t("classroom.seats")}</dt>
                <dd>{room.seats ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("classroom.accessibleSeats")}</dt>
                <dd>{room.accessible_seats ?? 0}</dd>
              </div>
              {room.floor !== undefined && (
                <div>
                  <dt>{t("classroom.floor")}</dt>
                  <dd>{room.floor === 0 ? t("classroom.groundFloor") : room.floor}</dd>
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

            {(building.address || mapsUrl) && (
              <p className="room-info__address">
                <Icon name="location-01" />
                <span>{building.address}</span>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                    {t("classroom.directions")}
                  </a>
                )}
              </p>
            )}
          </div>
        </section>

        <section className="card schedule-card" aria-labelledby="schedule-title">
          <h2 className="section-title" id="schedule-title">
            <Icon name="calendar-03" />
            {t("schedule.title")}
          </h2>
          <Schedule key={room.id} roomId={room.id} context={context} />
        </section>
      </div>
    </main>
  );
}
