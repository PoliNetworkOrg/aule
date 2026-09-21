import {
  Fragment,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { onTranslationChange, getTranslationVersion, t } from "../i18n";
import { fetchPhotoUrl, photoUrlCache } from "../utils/photo";
import { isFavourite } from "../utils/favourites";
import { tokenize } from "../classroom-search-data";
import type { Building, Classroom, ClassroomStatus } from "../types";

export function subscribeFavourites(listener: () => void) {
  window.addEventListener("favourites-changed", listener);

  return () => window.removeEventListener("favourites-changed", listener);
}

export function FilledStar() {
  return (
    <svg className="star-icon star-icon--filled" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.6l2.9 5.88 6.49.95-4.7 4.58 1.11 6.46L12 17.4l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.95z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    </svg>
  );
}

/** Escapes regex-special characters so `text` can be embedded literally in a `RegExp`. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wraps every match of `query` (as a whole phrase or as individual tokens) in `<mark>`. */
export function Highlight({ text, query = "" }: { text: string; query?: string }) {
  if (!query) return text;
  const fullPattern = escapeRegExp(query).replace(/ /g, "[\\s.]");
  const tokenPatterns = tokenize(query).map(escapeRegExp);
  const pattern = [fullPattern, ...tokenPatterns].sort((a, b) => b.length - a.length).join("|");

  return text
    .split(new RegExp(`(${pattern})`, "gi"))
    .map((part, index) =>
      index % 2 ? <mark key={index}>{part}</mark> : <Fragment key={index}>{part}</Fragment>,
    );
}

const STATUS_KEYS: Record<ClassroomStatus, string> = {
  free: "status.free",
  "partially-free": "status.partiallyFree",
  occupied: "status.occupied",
  "free-soon": "status.freeSoon",
  "occupied-soon": "status.occupiedSoon",
};

export interface ClassroomCardProps {
  classroom: Classroom & { status?: ClassroomStatus | null };
  building: Pick<Building, "name" | "altName">;
  fromTime?: string | null;
  toTime?: string | null;
  date?: string | null;
  query?: string;
  showFavouriteStar?: boolean;
  style?: CSSProperties;
}

export function ClassroomCard({
  classroom,
  building,
  fromTime,
  toTime,
  date,
  query = "",
  showFavouriteStar = false,
  style,
}: ClassroomCardProps) {
  useSyncExternalStore(onTranslationChange, getTranslationVersion);
  const favourite = useSyncExternalStore(subscribeFavourites, () => isFavourite(classroom.id));
  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [photo, setPhoto] = useState(() => ({
    url: photoUrlCache.get(classroom.id),
    loaded: photoUrlCache.has(classroom.id),
    failed: false,
  }));

  useEffect(() => {
    if (!classroom.idfoto || photo.url) return;
    let disposed = false;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          void fetchPhotoUrl(classroom.id).then((url) => {
            if (!disposed) setPhoto({ url, loaded: false, failed: false });
          });
        }
      },
      { rootMargin: "300px" },
    );

    observer.observe(cardRef.current!);

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [classroom.id, classroom.idfoto, photo.url]);
  useEffect(() => {
    const img = imgRef.current;

    if (!photo.url || photo.loaded || !img) return;
    let disposed = false;
    void img.decode().then(
      () => {
        if (!disposed) setPhoto((current) => ({ ...current, loaded: true }));
      },
      () => {
        if (!disposed) setPhoto((current) => ({ ...current, failed: true }));
      },
    );

    return () => {
      disposed = true;
    };
  }, [photo.url, photo.loaded]);
  const statusLabel = classroom.status ? t(STATUS_KEYS[classroom.status]) : "";
  const buildingLine = building.altName ? `${building.name} · ${building.altName}` : building.name;

  return (
    <div
      ref={cardRef}
      className={`classroom-card ${classroom.idfoto ? "classroom-card--photo" : "classroom-card--plain"}${showFavouriteStar && favourite ? " classroom-card--fav" : ""}${photo.failed ? " photo-failed" : ""}`}
      data-open-classroom={classroom.id}
      data-query-from={fromTime || undefined}
      data-query-to={toTime || undefined}
      data-query-date={date || undefined}
      data-idfoto={classroom.idfoto || undefined}
      data-fav-star={showFavouriteStar ? "" : undefined}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${classroom.name}`}
      style={style}
    >
      <div className="classroom-card-clip">
        {classroom.idfoto ? (
          <>
            <img
              ref={imgRef}
              className={`classroom-card-photo${photo.loaded ? " loaded" : ""}`}
              alt=""
              src={photo.url}
              onError={() => setPhoto((current) => ({ ...current, failed: true }))}
            />
            <div className="classroom-card-scrim" />
          </>
        ) : null}
        <div className="classroom-card-content">
          <h4 className="classroom-name" title={classroom.name}>
            <Highlight text={classroom.name} query={query} />
          </h4>
          <div className="classroom-card-meta-row">
            <p className="classroom-card-building">
              {t("building.prefix")} <Highlight text={buildingLine} query={query} />
            </p>
            {statusLabel && (
              <span className={`classroom-status-txt ${classroom.status}`}>{statusLabel}</span>
            )}
          </div>
        </div>
        {showFavouriteStar && (
          <span className="classroom-card-fav-star" aria-hidden="true">
            <FilledStar />
          </span>
        )}
      </div>
    </div>
  );
}
