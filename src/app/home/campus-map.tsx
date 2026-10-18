import { useEffect, useMemo, useRef, useState } from "react";
import { t, tf, useLocale } from "../i18n";
import type { BuildingAvailability } from "../state/availability";
import { closedBuildings, findCampus, unbookableRooms } from "../state/availability";
import { openClassroom } from "../state/navigation-context";
import { buildingKey, setMapBuilding, useStore } from "../state/store";
import type { Building, Campus } from "../types";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { cn } from "../../lib/cn";
import { IconButton } from "../ui/button";
import { Segmented, SegmentedOption } from "../ui/segmented";
import { Icon } from "../ui/icon";
import { pressable } from "../ui/motion";
import { useTheme } from "../theme";
import {
  applyMapTheme,
  hasCoordinates,
  loadMapLibre,
  MAP_CONTROLS,
  mapControlsLocale,
  onFirstRender,
  onStyleFailure,
  OPENFREEMAP_ATTRIBUTION,
  reduceMotion,
  toLngLat,
  type MapLibreLibrary,
} from "../map/maplibre";
import { buildingLabel } from "./campus-label";
import { focusedMapCampus } from "./campus-map-focus";
import { RoomCard, roomGrid, StatusTag } from "./room-card";

// The campuses in 3D (MapLibre over OpenFreeMap), shown in place of the results list. Each
// building gets a marker with its number of free rooms for the current search;
// picking one lists those rooms in a panel next to (or, on phones, under) the map.
// Secondary buildings (nothing to book: offices, residences, aule magne…) are
// small dots, there to find your way around; their panel says so.

const CAMPUS_ZOOM = 16.5;

const BUILDING_ZOOM = 18;

const PITCH = 55;

// Below this zoom the map stays flat: tilted, the far side of a campus framed
// from that high sinks into the horizon.
const FLAT_BELOW_ZOOM = 15;

/** Where a campus is framed: its own `zoom` when its buildings are too far apart for the default. */
function campusZoom(campus: Campus) {
  return campus.zoom ?? CAMPUS_ZOOM;
}

function pitchAt(zoom: number) {
  return zoom < FLAT_BELOW_ZOOM ? 0 : PITCH;
}

function flyTo(map: MapLibreMap, target: { lat: number; long: number }, zoom: number) {
  map.flyTo({
    center: toLngLat(target),
    zoom,
    pitch: pitchAt(zoom),
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
  entry: { key, campus, building },
  onClose,
}: {
  group: BuildingAvailability | undefined;
  entry: MapBuilding;
  onClose: () => void;
}) {
  useLocale();
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const campusIds = useStore((state) => state.campusIds);
  const rooms = group?.rooms ?? [];
  const closed = !!date && closedBuildings(campusIds, date, from, to).has(key);
  const label = buildingLabel(key, campusIds.length > 1);
  const others = date ? unbookableRooms(campus.id, building.name, date) : [];

  return (
    <aside
      className={cn(
        "flex w-[340px] flex-none flex-col gap-2.5 overflow-y-auto border-l border-border bg-surface p-3.5",
        "max-md:max-h-[48%] max-md:w-auto max-md:border-t max-md:border-l-0",
        // Settles in from the side (from below on phones, where it's a lower panel).
        // Closing is instant; the map is resized once, as the panel takes its room.
        "transition-[opacity,translate] duration-250 ease-smooth-out starting:translate-x-3 starting:opacity-0 max-md:starting:translate-x-0 max-md:starting:translate-y-3",
      )}
      aria-label={label}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-17 font-bold">{label}</h3>
          <p className="text-13 text-muted">
            {building.secondary
              ? t("map.noClassrooms")
              : closed
                ? t("map.closed")
                : tf(rooms.length === 1 ? "results.oneAvailable" : "results.available", {
                    n: rooms.length,
                  })}
            {building.address ? ` · ${building.address}` : ""}
          </p>
        </div>
        <IconButton size="small" aria-label={t("common.close")} onClick={onClose}>
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
      ) : building.secondary ? (
        !others.length && <p className="text-14 text-muted">{t("map.secondaryNote")}</p>
      ) : (
        <p className="text-14 text-muted">{t(closed ? "map.closedNote" : "map.noRooms")}</p>
      )}
      {others.length > 0 && (
        // Rooms never offered as free, each with the reason: usually closed, or no schedule.
        <section className="flex flex-col gap-1.5" aria-labelledby="map-other-rooms">
          <h4 className="mt-1 text-13 font-bold text-muted" id="map-other-rooms">
            {t("map.otherRooms")}
          </h4>
          <ul className="flex flex-col gap-1.5">
            {others.map(({ entry, status }) => (
              <li key={entry.room.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left",
                    "transition-[border-color,scale] hover:border-accent-soft-border",
                    pressable,
                  )}
                  onClick={() =>
                    openClassroom(entry, date ? { date, from, to, highlight: false } : null)
                  }
                >
                  <span className="truncate font-bold">{entry.room.name}</span>
                  <StatusTag status={status} slots={[]} compact />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

interface BuildingMarker {
  marker: MapLibreMarker;
  element: HTMLButtonElement;
  /** The free-room count of a building marker; unused (and detached) on a dot. */
  count: HTMLSpanElement;
}

// Marker elements are built outside React: their state is data attributes the
// classes below react to, and a new one fades and swells in.
const MARKER_APPEAR =
  "transition-[background-color,border-color,color,opacity,scale] duration-250 ease-smooth-out starting:scale-90 starting:opacity-0";

const MARKER_DOT = cn(
  "size-3 rounded-full border-2 border-surface bg-neutral shadow-sm hover:bg-accent",
  "data-[selected=true]:size-3.5 data-[selected=true]:bg-accent",
);

const MARKER_PILL = cn(
  "inline-flex h-[30px] items-center gap-1.5 rounded-full border border-border bg-surface pr-1 pl-2.5",
  "font-sans text-13 font-bold whitespace-nowrap text-foreground shadow-md hover:border-accent",
  "data-[closed=true]:border-dashed data-[closed=true]:text-muted",
  "data-[selected=true]:border-accent data-[selected=true]:bg-accent data-[selected=true]:text-on-accent",
);

const MARKER_COUNT = cn(
  "inline-grid h-[22px] min-w-[22px] place-items-center rounded-full bg-free px-1.5 text-12 text-on-status",
  "data-[empty=true]:bg-surface-muted data-[empty=true]:text-muted",
);

export default function CampusMap({ results }: { results: BuildingAvailability[] }) {
  useLocale();
  const theme = useTheme();
  const host = useRef<HTMLDivElement>(null);
  const campusSwitch = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef(new Map<string, BuildingMarker>());
  const toggleBuilding = useRef<(key: string, campusId: string) => void>(() => {});
  const [library, setLibrary] = useState<MapLibreLibrary | null>(null);
  const [error, setError] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [focusedCampusId, setFocusedCampusId] = useState<string | null>(null);
  const campusIds = useStore((state) => state.campusIds);
  const selected = useStore((state) => state.mapBuilding);
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const severalCampuses = campusIds.length > 1;
  const selection = useMemo(() => campusIds.flatMap((id) => findCampus(id) ?? []), [campusIds]);

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
  const focusedCampus = focusedMapCampus(selection, focusedCampusId, selectedEntry?.campus.id);

  // Remember the fallback too: re-adding a removed campus must not revive its old focus.
  const activeCampusId = focusedCampus?.id ?? null;

  if (focusedCampusId !== activeCampusId) setFocusedCampusId(activeCampusId);

  // A marker can switch campuses too: keep its active segment in view on narrow screens.
  useEffect(() => {
    const active = campusSwitch.current?.querySelector<HTMLElement>("[aria-pressed='true']");

    if (active?.getClientRects().length)
      active.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusedCampus]);

  // Boot the map once.
  useEffect(() => {
    let disposed = false;
    const live = markers.current;

    loadMapLibre()
      .then((maplibregl) => {
        if (disposed || !host.current) return;

        const campus = campusIds.map(findCampus).find((entry) => !!entry && hasCoordinates(entry));
        const start = campus && hasCoordinates(campus) ? campus : { lat: 45.488, long: 9.195 };

        const map = new maplibregl.Map({
          container: host.current,
          center: [start.long, start.lat],
          zoom: campus ? campusZoom(campus) : 11.3,
          minZoom: 8.5,
          // Whole number on purpose: MapLibre caps vector tiles at
          // maxZoom − zoomLevelsToOverscale (4), and a fractional cap (18.5 →
          // 14.5) fetches z15 tiles OpenFreeMap doesn't serve and skips
          // overscaling, dropping every layer with minzoom ≥ 16 (toilets,
          // most POIs).
          maxZoom: 19,
          pitch: campus ? pitchAt(campusZoom(campus)) : 0,
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
        onFirstRender(map, () => !disposed && setDrawn(true));
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
      live.forEach(({ marker }) => marker.remove());
      live.clear();
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

    if (selectedBuilding && hasCoordinates(selectedBuilding))
      flyTo(map, selectedBuilding, BUILDING_ZOOM);
    else if (focusedCampus) {
      const target = hasCoordinates(focusedCampus)
        ? focusedCampus
        : focusedCampus.buildings.find(hasCoordinates);

      if (target && hasCoordinates(target)) flyTo(map, target, campusZoom(focusedCampus));
    }
  }, [library, focusedCampus, selectedBuilding]);

  // What a marker click does, with the selection as of the latest render.
  useEffect(() => {
    toggleBuilding.current = (key, campusId) => {
      setFocusedCampusId(campusId);
      setMapBuilding(key === selected ? null : key);
    };
  }, [selected]);

  // Building markers labelled with their free-room count for the current search.
  // They persist and are updated in place: only buildings that appear or go away
  // add or remove one, so a change of filters doesn't make every marker flash.
  useEffect(() => {
    const map = mapRef.current;

    if (!map || !library) return;

    const closed = date ? closedBuildings(campusIds, date, from, to) : new Set<string>();
    const wanted = new Set<string>();

    for (const { key, campus, building } of entries) {
      if (!hasCoordinates(building)) continue;

      wanted.add(key);

      const label = `${buildingLabel(key, severalCampuses)}: `;
      const free = results.find((group) => group.key === key)?.rooms.length ?? 0;
      const isClosed = closed.has(key);
      let entry = markers.current.get(key);

      if (!entry) {
        const element = document.createElement("button");
        const text = document.createElement("span");
        const count = document.createElement("span");

        element.type = "button";
        element.addEventListener("click", () => toggleBuilding.current(key, campus.id));

        if (building.secondary) {
          // Nothing to book: a small dot with no count, named on hover and in its panel.
          element.className = cn(MARKER_DOT, MARKER_APPEAR);
          element.title = building.altName
            ? `${building.name} · ${building.altName}`
            : building.name;
        } else {
          // MapLibre adds its own classes (position, transform) to the element.
          element.className = cn(MARKER_PILL, MARKER_APPEAR);
          count.className = MARKER_COUNT;
          text.textContent = building.altName || building.name;
          element.append(text, count);
        }

        entry = {
          marker: new library.Marker({
            element,
            anchor: building.secondary ? "center" : "bottom",
          })
            .setLngLat([building.long, building.lat])
            .addTo(map),
          element,
          count,
        };
        markers.current.set(key, entry);
      }

      const { element } = entry;

      element.dataset.selected = String(key === selected);
      element.dataset.closed = String(isClosed);
      entry.count.dataset.empty = String(!free);
      entry.count.textContent = String(free);

      if (building.secondary) {
        element.setAttribute("aria-label", `${label}${t("map.noClassrooms")}`);
      } else {
        element.setAttribute(
          "aria-label",
          `${label}${isClosed ? t("map.closed") : tf("results.available", { n: free })}`,
        );

        if (isClosed) element.title = t("map.closed");
        else element.removeAttribute("title");
      }
    }

    for (const [key, { marker }] of markers.current) {
      if (wanted.has(key)) continue;

      marker.remove();
      markers.current.delete(key);
    }
  }, [library, entries, campusIds, severalCampuses, results, selected, date, from, to]);

  return (
    <div className={cn("relative flex min-h-0 flex-1 max-md:flex-col", MAP_CONTROLS)}>
      {/* Clips what MapLibre draws past the canvas: markers of buildings off screen,
          mid-flight, would otherwise sit over the building panel. */}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-clip bg-surface-muted">
        {/* MapLibre's unlayered stylesheet sets position: relative; keep the canvas filling this wrapper. */}
        <div
          className={cn(
            "absolute! inset-0 transition-opacity duration-250 ease-in-out",
            !drawn && "opacity-0",
          )}
          ref={host}
          role="application"
          aria-label={t("results.map")}
        />
        {severalCampuses && !error && (
          <Segmented
            ref={campusSwitch}
            className="absolute top-0 left-1/2 w-max max-w-[calc(100%-112px)] -translate-x-1/2 overflow-x-auto overscroll-contain rounded-t-none rounded-b-lg border-t-0 shadow-md"
            role="group"
            aria-label={t("campus.label")}
          >
            {selection.map((campus) => (
              <SegmentedOption
                key={campus.id}
                className="min-h-11 shrink-0"
                aria-pressed={campus.id === focusedCampus?.id}
                aria-label={tf("map.viewCampus", { campus: campus.name })}
                onClick={() => {
                  setFocusedCampusId(campus.id);
                  setMapBuilding(null);
                }}
              >
                {campus.name}
              </SegmentedOption>
            ))}
          </Segmented>
        )}
      </div>
      {error && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-muted transition-opacity duration-250 ease-in-out starting:opacity-0">
          <Icon name="alert-02" />
          {t("map.error")}
        </div>
      )}
      {!selectedEntry && !error && (
        <p className="pointer-events-none absolute bottom-7 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface px-3 py-1.5 text-13 whitespace-nowrap text-muted shadow-sm transition-opacity duration-250 ease-in-out starting:opacity-0">
          {t("map.hint")}
        </p>
      )}
      {selectedEntry && (
        <BuildingPanel
          entry={selectedEntry}
          group={results.find((group) => group.key === selectedEntry.key)}
          onClose={() => {
            setFocusedCampusId(selectedEntry.campus.id);
            setMapBuilding(null);
          }}
        />
      )}
    </div>
  );
}
