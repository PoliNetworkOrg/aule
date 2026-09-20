import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { ClassroomCard, subscribeFavourites } from "./classroom-card";
import { getClassroomStatusNow } from "../available-rooms-script";
import { getFavouriteIds, initFavouriteMarkers } from "../utils/favourites";
import { onTranslationChange, getTranslationVersion, t } from "../i18n";
import type { Building, Campus, Classroom } from "../types";

const index = new Map<number, { classroom: Classroom; building: Building }>();

let revision = 0;

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function renderFavourites() {
  revision++;
  flushSync(() => listeners.forEach((listener) => listener()));
}

export function initFavourites(campuses: Campus[]) {
  index.clear();

  for (const campus of campuses)
    for (const building of campus.buildings)
      for (const classroom of building.classrooms)
        index.set(Number(classroom.id), { classroom, building });
  initFavouriteMarkers();
  renderFavourites();
}

export function Favourites() {
  useSyncExternalStore(subscribe, () => revision);
  useSyncExternalStore(subscribeFavourites, () => JSON.stringify(getFavouriteIds()));
  useSyncExternalStore(onTranslationChange, getTranslationVersion);

  const entries = getFavouriteIds().flatMap((id) => {
    const entry = index.get(id);

    return entry ? [entry] : [];
  });

  return (
    <>
      <div id="favourites-carousel" className="favourites-carousel" hidden={!entries.length}>
        {entries.map(({ classroom, building }) => (
          <ClassroomCard
            key={classroom.id}
            classroom={{ ...classroom, status: getClassroomStatusNow(classroom.id) }}
            building={building}
          />
        ))}
      </div>
      <p
        id="favourites-empty"
        className="favourites-empty secondary"
        data-react-owned=""
        data-i18n="favourites.empty"
        hidden={!!entries.length}
      >
        {t("favourites.empty")}
      </p>
    </>
  );
}
