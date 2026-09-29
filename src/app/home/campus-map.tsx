import { useEffect, useRef, useState } from "react";
import { t, tf, useLocale } from "../i18n";
import { isNumber } from "../../lib/guards";
import type { BuildingAvailability } from "../state/availability";
import { findCampus } from "../state/availability";
import { setMapBuilding, useStore } from "../state/store";
import type { Building } from "../types";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { Icon } from "../ui/icon";
import { getTheme, useTheme } from "../theme";
import { DARK_THEME, LIGHT_THEME, themedStyle } from "./map-theme";
import { RoomCard } from "./room-card";

type MapLibreLibrary = typeof import("maplibre-gl");

type LngLat = [number, number];

// The campus in 3D (MapLibre over OpenFreeMap), shown in place of the results list. Each
// building gets a marker with its number of free rooms for the current search;
// picking one lists those rooms in a panel next to (or, on phones, under) the map.

// OpenFreeMap (openfreemap.org): free, keyless, no usage caps. Liberty is the
// only one of its styles with 3D buildings; both themes repaint it at load
// time (see map-theme.ts).
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

const CAMPUS_ZOOM = 16.5;

const BUILDING_ZOOM = 18;

const PITCH = 55;

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

function hasCoordinates(value: {
  lat?: number;
  long?: number;
}): value is { lat: number; long: number } {
  return isNumber(value.lat) && isNumber(value.long);
}

let mapLibrePromise: Promise<MapLibreLibrary> | null = null;

// MapLibre's worker and stylesheet are loaded by URL (`?worker&url`, `?url`):
// the library's own `new URL("./maplibre-gl-worker.mjs", import.meta.url)` is a
// path Vite neither pre-bundles nor emits, and with `cssCodeSplit: false` a
// plain stylesheet import would fold into the shell CSS every page loads.
function loadMapLibre() {
  mapLibrePromise ??= Promise.all([
    import("maplibre-gl"),
    import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
    import("maplibre-gl/dist/maplibre-gl.css?url"),
  ])
    .then(async ([lib, { default: workerUrl }, { default: cssUrl }]) => {
      lib.setWorkerUrl(workerUrl);
      await loadStylesheet(cssUrl);

      return lib;
    })
    .catch((reason: Error) => {
      mapLibrePromise = null;
      throw reason;
    });

  return mapLibrePromise;
}

// Non-fatal if it fails: the map still renders, the controls just sit off.
// Reused across remounts rather than appended again.
function loadStylesheet(href: string) {
  if (document.querySelector("link[data-maplibre-css]")) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const link = document.createElement("link");

    link.rel = "stylesheet";
    link.href = href;
    link.dataset.maplibreCss = "";
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.append(link);
  });
}

// OpenFreeMap's styles have no built-in light/dark switch, so the style is
// re-applied with the current palette. Same style URL both ways, so MapLibre
// diffs it into paint-property updates instead of a full reload.
function applyTheme(map: MapLibreMap) {
  map.setStyle(STYLE_URL, {
    transformStyle: themedStyle(getTheme() === "dark" ? DARK_THEME : LIGHT_THEME),
  });
}

function flyTo(map: MapLibreMap, target: { lat: number; long: number }, zoom: number) {
  const center: LngLat = [target.long, target.lat];

  map.flyTo({
    center,
    zoom,
    pitch: PITCH,
    bearing: 0,
    duration: reduceMotion.matches ? 0 : 1000,
    essential: true,
  });
}

function BuildingPanel({
  group,
  building,
}: {
  group: BuildingAvailability | undefined;
  building: Building;
}) {
  useLocale();
  const date = useStore((state) => state.date);
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const rooms = group?.rooms ?? [];

  return (
    <aside className="map-panel" aria-label={`${t("building.prefix")} ${building.name}`}>
      <header className="map-panel__header">
        <div>
          <h3 className="map-panel__title">
            {t("building.prefix")} {building.name}
          </h3>
          <p className="map-panel__subtitle">
            {tf(rooms.length === 1 ? "results.oneAvailable" : "results.available", {
              n: rooms.length,
            })}
            {building.address ? ` · ${building.address}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="icon-button icon-button--small"
          aria-label={t("common.close")}
          onClick={() => setMapBuilding(null)}
        >
          <Icon name="cancel-01" />
        </button>
      </header>
      {rooms.length ? (
        <ul className="room-grid room-grid--single">
          {rooms.map((result) => (
            <RoomCard key={result.room.id} result={result} date={date} from={from} to={to} />
          ))}
        </ul>
      ) : (
        <p className="map-panel__empty">{t("map.noRooms")}</p>
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
  const campusId = useStore((state) => state.campusId);
  const selected = useStore((state) => state.mapBuilding);
  const campus = findCampus(campusId);
  const selectedBuilding = campus?.buildings.find((building) => building.name === selected) ?? null;

  // Boot the map once.
  useEffect(() => {
    let disposed = false;

    loadMapLibre()
      .then((maplibregl) => {
        if (disposed || !host.current) return;

        const start = campus && hasCoordinates(campus) ? campus : { lat: 45.488, long: 9.195 };

        const map = new maplibregl.Map({
          container: host.current,
          center: [start.long, start.lat],
          zoom: campus ? CAMPUS_ZOOM : 11.3,
          minZoom: 8.5,
          maxZoom: 18.5,
          pitch: campus ? PITCH : 0,
          maxPitch: 70,
          pitchWithRotate: true,
          touchPitch: true,
          // MapLibre only lists a source's attribution once it has marked that
          // source as rendered and can skip the re-check, leaving the
          // license-required OSM credit blank, so pin it (same string as the
          // tiles' TileJSON; MapLibre dedupes the two).
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

        // setStyle() reports a failed style request (OpenFreeMap down, offline)
        // through the `error` event rather than throwing. Any error before the
        // first style load is that failure; later ones (a missed tile or
        // sprite) are routine and leave the map usable.
        let styleLoaded = false;

        map.once("style.load", () => {
          styleLoaded = true;
        });
        map.on("error", (event) => {
          if (styleLoaded || disposed) return;

          console.error("Campus map style failed to load", event.error);
          setError(true);
        });
        applyTheme(map);
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
    // The map is created once; campus changes fly the existing camera below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mapRef.current) applyTheme(mapRef.current);
  }, [theme]);

  // Follow the campus and building selection. The building panel has just
  // shrunk (or grown) the canvas, so resize before aiming the camera.
  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    map.resize();

    if (selectedBuilding && hasCoordinates(selectedBuilding))
      flyTo(map, selectedBuilding, BUILDING_ZOOM);
    else if (campus && hasCoordinates(campus)) flyTo(map, campus, CAMPUS_ZOOM);
  }, [library, campus, selectedBuilding]);

  // Building markers labelled with their free-room count for the current search.
  useEffect(() => {
    const map = mapRef.current;

    if (!map || !library || !campus) return;

    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    for (const building of campus.buildings) {
      if (!hasCoordinates(building)) continue;

      const free =
        results.find((group) => group.building.name === building.name)?.rooms.length ?? 0;

      const element = document.createElement("button");
      const label = document.createElement("span");
      const count = document.createElement("span");

      element.type = "button";
      element.className = `map-marker${free ? "" : " map-marker--none"}${building.name === selected ? " map-marker--selected" : ""}`;
      element.setAttribute(
        "aria-label",
        `${t("building.prefix")} ${building.name}: ${tf("results.available", { n: free })}`,
      );
      label.className = "map-marker__label";
      label.textContent = building.altName || building.name;
      count.className = "map-marker__count";
      count.textContent = String(free);
      element.append(label, count);
      element.addEventListener("click", () =>
        setMapBuilding(building.name === selected ? null : building.name),
      );
      markers.current.push(
        new library.Marker({ element, anchor: "bottom" })
          .setLngLat([building.long, building.lat])
          .addTo(map),
      );
    }
  }, [library, campus, results, selected]);

  return (
    <div className={`campus-map${selectedBuilding ? " campus-map--panel" : ""}`}>
      <div
        className="campus-map__canvas"
        ref={host}
        role="application"
        aria-label={t("results.map")}
      />
      {error && (
        <div className="campus-map__error">
          <Icon name="alert-02" />
          {t("map.error")}
        </div>
      )}
      {!selectedBuilding && !error && <p className="campus-map__hint">{t("map.hint")}</p>}
      {selectedBuilding && (
        <BuildingPanel
          building={selectedBuilding}
          group={results.find((group) => group.building.name === selectedBuilding.name)}
        />
      )}
    </div>
  );
}
