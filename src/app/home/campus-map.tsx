import { useEffect, useMemo, useRef, useState } from "react";
import { t, tf, useLocale } from "../i18n";
import type { BuildingAvailability } from "../state/availability";
import { closedBuildings, findCampus } from "../state/availability";
import { buildingKey, setMapBuilding, useStore } from "../state/store";
import type { Building, Campus } from "../types";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { cn } from "../../lib/cn";
import { IconButton } from "../ui/button";
import { Icon } from "../ui/icon";
import { useTheme } from "../theme";
import {
  applyMapTheme,
  hasCoordinates,
  loadMapLibre,
  MAP_CONTROLS,
  mapControlsLocale,
  onStyleFailure,
  OPENFREEMAP_ATTRIBUTION,
  reduceMotion,
  toLngLat,
  type MapLibreLibrary,
} from "../map/maplibre";
import { buildingLabel } from "./campus-label";
import { RoomCard, roomGrid } from "./room-card";

// The campuses in 3D (MapLibre over OpenFreeMap), shown in place of the results list. Each
// building gets a marker with its number of free rooms for the current search;
// picking one lists those rooms in a panel next to (or, on phones, under) the map.

const CAMPUS_ZOOM = 16.5;

const BUILDING_ZOOM = 18;

const PITCH = 55;

function flyTo(map: MapLibreMap, target: { lat: number; long: number }, zoom: number) {
  map.flyTo({
    center: toLngLat(target),
    zoom,
    pitch: PITCH,
    bearing: 0,
    duration: reduceMotion.matches ? 0 : 1000,
    essential: true,
  });
}

/** Several campuses: frame all their buildings, never closer than one campus is shown. */
function fitCampuses(map: MapLibreMap, library: MapLibreLibrary, campuses: Campus[]) {
  const bounds = new library.LngLatBounds();

  for (const campus of campuses) {
    let placed = false;

    for (const building of campus.buildings)
      if (hasCoordinates(building)) {
        bounds.extend(toLngLat(building));
        placed = true;
      }

    if (!placed && hasCoordinates(campus)) bounds.extend(toLngLat(campus));
  }

  if (bounds.isEmpty()) return;

  map.fitBounds(bounds, {
    padding: 60,
    maxZoom: CAMPUS_ZOOM,
    pitch: PITCH,
    bearing: 0,
    duration: reduceMotion.matches ? 0 : 1000,
    essential: true,
  });
}

interface MapBuilding {
  key: string;
  campus: Campus;
  building: Building;
}

function BuildingPanel({
  group,
  entry: { key, building },
}: {
  group: BuildingAvailability | undefined;
  entry: MapBuilding;
}) {
  useLocale();
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const campusIds = useStore((state) => state.campusIds);
  const rooms = group?.rooms ?? [];
  const closed = !!date && closedBuildings(campusIds, date, from, to).has(key);
  const label = buildingLabel(key, campusIds.length > 1);

  return (
    <aside
      className={cn(
        "flex w-[340px] flex-none flex-col gap-2.5 overflow-y-auto border-l border-border bg-surface p-3.5",
        "max-md:max-h-[48%] max-md:w-auto max-md:border-t max-md:border-l-0",
      )}
      aria-label={label}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-17 font-bold">{label}</h3>
          <p className="text-13 text-muted">
            {closed
              ? t("map.closed")
              : tf(rooms.length === 1 ? "results.oneAvailable" : "results.available", {
                  n: rooms.length,
                })}
            {building.address ? ` · ${building.address}` : ""}
          </p>
        </div>
        <IconButton
          size="small"
          aria-label={t("common.close")}
          onClick={() => setMapBuilding(null)}
        >
          <Icon name="cancel-01" />
        </IconButton>
      </header>
      {rooms.length ? (
        <ul
          className={cn(
            roomGrid,
            "grid-cols-[1fr] max-md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] md:gap-1.5",
          )}
        >
          {rooms.map((result) => (
            <RoomCard
              key={result.room.id}
              result={result}
              date={date}
              from={from}
              to={to}
              layout="row"
            />
          ))}
        </ul>
      ) : (
        <p className="text-14 text-muted">{t(closed ? "map.closedNote" : "map.noRooms")}</p>
      )}
    </aside>
  );
}

export default function CampusMap({ results }: { results: BuildingAvailability[] }) {
  useLocale();
  const theme = useTheme();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<MapLibreMarker[]>([]);
  const [library, setLibrary] = useState<MapLibreLibrary | null>(null);
  const [error, setError] = useState(false);
  const campusIds = useStore((state) => state.campusIds);
  const selected = useStore((state) => state.mapBuilding);
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const severalCampuses = campusIds.length > 1;

  const entries = useMemo(
    () =>
      campusIds.flatMap((id) => {
        const campus = findCampus(id);

        if (!campus) return [];

        return campus.buildings.map((building): MapBuilding => ({
          key: buildingKey(id, building.name),
          campus,
          building,
        }));
      }),
    [campusIds],
  );

  const selectedEntry = entries.find((entry) => entry.key === selected) ?? null;
  // The directory's own object, stable across renders, for the camera effect.
  const selectedBuilding = selectedEntry?.building ?? null;

  // Boot the map once.
  useEffect(() => {
    let disposed = false;

    loadMapLibre()
      .then((maplibregl) => {
        if (disposed || !host.current) return;

        const campus = campusIds.map(findCampus).find((entry) => !!entry && hasCoordinates(entry));
        const start = campus && hasCoordinates(campus) ? campus : { lat: 45.488, long: 9.195 };

        const map = new maplibregl.Map({
          container: host.current,
          center: [start.long, start.lat],
          zoom: campus ? CAMPUS_ZOOM : 11.3,
          minZoom: 8.5,
          // Whole number on purpose: MapLibre caps vector tiles at
          // maxZoom − zoomLevelsToOverscale (4), and a fractional cap (18.5 →
          // 14.5) fetches z15 tiles OpenFreeMap doesn't serve and skips
          // overscaling, dropping every layer with minzoom ≥ 16 (toilets,
          // most POIs).
          maxZoom: 19,
          pitch: campus ? PITCH : 0,
          maxPitch: 70,
          pitchWithRotate: true,
          touchPitch: true,
          locale: mapControlsLocale(),
          attributionControl: { customAttribution: OPENFREEMAP_ATTRIBUTION },
        });

        map.addControl(
          new maplibregl.NavigationControl({ showZoom: true, showCompass: true }),
          "top-right",
        );
        map.addControl(
          new maplibregl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
          }),
          "top-right",
        );

        onStyleFailure(map, (reason) => {
          if (disposed) return;

          console.error("Campus map style failed to load", reason);
          setError(true);
        });
        applyMapTheme(map);
        mapRef.current = map;
        setLibrary(maplibregl);
      })
      .catch((reason: Error) => {
        console.error("Campus map failed to load", reason);

        if (!disposed) setError(true);
      });

    return () => {
      disposed = true;
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is created once; campus changes move the existing camera below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mapRef.current) applyMapTheme(mapRef.current);
  }, [theme]);

  // Follow the campus and building selection. The building panel has just
  // shrunk (or grown) the canvas, so resize before aiming the camera.
  useEffect(() => {
    const map = mapRef.current;

    if (!map || !library) return;

    map.resize();

    const selection = campusIds.flatMap((id) => findCampus(id) ?? []);
    const campus = selection[0];

    if (selectedBuilding && hasCoordinates(selectedBuilding))
      flyTo(map, selectedBuilding, BUILDING_ZOOM);
    else if (selection.length > 1) fitCampuses(map, library, selection);
    else if (campus && hasCoordinates(campus)) flyTo(map, campus, CAMPUS_ZOOM);
  }, [library, campusIds, selectedBuilding]);

  // Building markers labelled with their free-room count for the current search.
  useEffect(() => {
    const map = mapRef.current;

    if (!map || !library) return;

    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    const closed = date ? closedBuildings(campusIds, date, from, to) : new Set<string>();

    for (const { key, building } of entries) {
      if (!hasCoordinates(building)) continue;

      const free = results.find((group) => group.key === key)?.rooms.length ?? 0;

      const element = document.createElement("button");
      const label = document.createElement("span");
      const count = document.createElement("span");

      const isClosed = closed.has(key);

      element.type = "button";
      // MapLibre adds its own classes (position, transform) to the element.
      element.className = cn(
        "inline-flex h-[30px] items-center gap-1.5 rounded-full border border-border bg-surface pr-1 pl-2.5",
        "font-sans text-13 font-bold whitespace-nowrap text-foreground shadow-md hover:border-accent",
        isClosed && "border-dashed text-muted",
        key === selected && "border-accent bg-accent text-on-accent",
      );
      element.setAttribute(
        "aria-label",
        `${buildingLabel(key, severalCampuses)}: ${isClosed ? t("map.closed") : tf("results.available", { n: free })}`,
      );

      if (isClosed) element.title = t("map.closed");

      label.textContent = building.altName || building.name;
      count.className = cn(
        "inline-grid h-[22px] min-w-[22px] place-items-center rounded-full bg-free px-1.5 text-12 text-on-status",
        !free && "bg-surface-muted text-muted",
      );
      count.textContent = String(free);
      element.append(label, count);
      element.addEventListener("click", () => setMapBuilding(key === selected ? null : key));
      markers.current.push(
        new library.Marker({ element, anchor: "bottom" })
          .setLngLat([building.long, building.lat])
          .addTo(map),
      );
    }
  }, [library, entries, campusIds, severalCampuses, results, selected, date, from, to]);

  return (
    <div className={cn("relative flex min-h-0 flex-1 max-md:flex-col", MAP_CONTROLS)}>
      <div
        className="min-w-0 flex-1 bg-surface-muted"
        ref={host}
        role="application"
        aria-label={t("results.map")}
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-muted">
          <Icon name="alert-02" />
          {t("map.error")}
        </div>
      )}
      {!selectedEntry && !error && (
        <p className="pointer-events-none absolute bottom-7 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface px-3 py-1.5 text-13 whitespace-nowrap text-muted shadow-sm">
          {t("map.hint")}
        </p>
      )}
      {selectedEntry && (
        <BuildingPanel
          entry={selectedEntry}
          group={results.find((group) => group.key === selectedEntry.key)}
        />
      )}
    </div>
  );
}
