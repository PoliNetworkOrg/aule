import { useEffect, useRef, useState } from "react";
import { getMapboxToken } from "../config";
import { t, tf, useLocale } from "../i18n";
import { isNumber } from "../../lib/guards";
import type { BuildingAvailability } from "../state/availability";
import { findCampus } from "../state/availability";
import { setMapBuilding, useStore } from "../state/store";
import type { Building } from "../types";
import type { LngLat, MapboxLibrary, MapboxMap, MapboxMarker } from "./mapbox";
import { Icon } from "../ui/icon";
import { RoomCard } from "./room-card";

// The campus in 3D (Mapbox Standard), shown in place of the results list. Each
// building gets a marker with its number of free rooms for the current search;
// picking one lists those rooms in a panel next to (or, on phones, under) the map.

const MAPBOX_VERSION = "3.9.1";

const CAMPUS_ZOOM = 16.5;

const BUILDING_ZOOM = 18;

const PITCH = 55;

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

const darkScheme = matchMedia("(prefers-color-scheme: dark)");

function hasCoordinates(value: {
  lat?: number;
  long?: number;
}): value is { lat: number; long: number } {
  return isNumber(value.lat) && isNumber(value.long);
}

let mapboxPromise: Promise<MapboxLibrary> | null = null;

function loadMapbox() {
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);

  mapboxPromise ??= new Promise<MapboxLibrary>((resolve, reject) => {
    const base = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}`;
    const link = document.createElement("link");
    const script = document.createElement("script");

    link.rel = "stylesheet";
    link.href = `${base}/mapbox-gl.css`;
    script.src = `${base}/mapbox-gl.js`;
    script.onload = () =>
      window.mapboxgl ? resolve(window.mapboxgl) : reject(new Error("mapboxgl missing"));
    script.onerror = () => {
      mapboxPromise = null;
      reject(new Error("Failed to load mapbox-gl.js"));
    };

    document.head.append(link, script);
  });

  return mapboxPromise;
}

function applyLightPreset(map: MapboxMap) {
  try {
    map.setConfigProperty("basemap", "lightPreset", darkScheme.matches ? "night" : "day");
  } catch {
    /* style not loaded yet */
  }
}

function flyTo(map: MapboxMap, target: { lat: number; long: number }, zoom: number) {
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
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markers = useRef<MapboxMarker[]>([]);
  const [library, setLibrary] = useState<MapboxLibrary | null>(null);
  const [error, setError] = useState(false);
  const campusId = useStore((state) => state.campusId);
  const selected = useStore((state) => state.mapBuilding);
  const campus = findCampus(campusId);
  const selectedBuilding = campus?.buildings.find((building) => building.name === selected) ?? null;

  // Boot the map once.
  useEffect(() => {
    let disposed = false;

    Promise.all([getMapboxToken(), loadMapbox()])
      .then(([token, mapboxgl]) => {
        if (disposed || !host.current) return;

        const start = campus && hasCoordinates(campus) ? campus : { lat: 45.488, long: 9.195 };

        mapboxgl.accessToken = token;

        const map = new mapboxgl.Map({
          container: host.current,
          style: "mapbox://styles/mapbox/standard",
          center: [start.long, start.lat],
          zoom: campus ? CAMPUS_ZOOM : 11.3,
          minZoom: 8.5,
          maxZoom: 18.5,
          pitch: campus ? PITCH : 0,
          maxPitch: 70,
          pitchWithRotate: true,
          touchPitch: true,
          logoPosition: "bottom-left",
        });

        map.addControl(
          new mapboxgl.NavigationControl({ showZoom: true, showCompass: true }),
          "top-right",
        );
        map.addControl(
          new mapboxgl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
            showUserHeading: true,
          }),
          "top-right",
        );
        map.on("style.load", () => applyLightPreset(map));
        mapRef.current = map;
        setLibrary(mapboxgl);
      })
      .catch((reason: Error) => {
        console.error("Campus map failed to load", reason);

        if (!disposed) setError(true);
      });

    const onScheme = () => mapRef.current && applyLightPreset(mapRef.current);

    darkScheme.addEventListener("change", onScheme);

    return () => {
      disposed = true;
      darkScheme.removeEventListener("change", onScheme);
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is created once; campus changes fly the existing camera below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the campus and building selection.
  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

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

  // The panel changes the map's width on desktop.
  useEffect(() => {
    mapRef.current?.resize();
  }, [selectedBuilding]);

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
