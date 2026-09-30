import { useEffect, useRef, useState, type RefObject } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { t, tf, useLocale } from "../i18n";
import { useTheme } from "../theme";
import type { Building } from "../types";
import { cn } from "../../lib/cn";
import { Icon } from "../ui/icon";
import { Segmented, SegmentedOption } from "../ui/segmented";
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

// The classroom page's location map: its own MapLibre instance, pointed at the
// room's building. 3D tilts in on the building; 2D pulls back, top-down, to
// the whole campus with the other buildings as quiet dots. The page scrolls
// over it, so gestures are cooperative (Ctrl/⌘ + scroll, two fingers) until
// it goes fullscreen.

type MapView = "2d" | "3d";

type Point = { lat: number; long: number };

const VIEWS: MapView[] = ["2d", "3d"];

const VIEW_KEY = "poliAule_mapView";

const BUILDING_ZOOM = 17.5;

// The location map's own MapLibre overrides (its unlayered stylesheet loads
// later, hence !important).
const LOCATION_CONTROLS = [
  // "Ctrl + scroll to zoom" / "two fingers to move" hint over the map.
  "[&_.maplibregl-cooperative-gesture-screen]:bg-scrim/55! [&_.maplibregl-cooperative-gesture-screen]:p-4!",
  "[&_.maplibregl-cooperative-gesture-screen]:font-sans! [&_.maplibregl-cooperative-gesture-screen]:text-15!",
  "[&_.maplibregl-cooperative-gesture-screen]:font-semibold!",
].join(" ");

const CAMERA = {
  "2d": { pitch: 0, bearing: 0 },
  "3d": { pitch: 60, bearing: -20 },
};

function isMapView(value: string | null): value is MapView {
  return VIEWS.some((view) => view === value);
}

// Remembered across rooms and visits; storage can be unavailable (private
// mode, blocked site data), in which case it's just 3D every time.
function savedView(): MapView {
  try {
    const saved = localStorage.getItem(VIEW_KEY);

    return isMapView(saved) ? saved : "3d";
  } catch {
    return "3d";
  }
}

function saveView(view: MapView) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Not remembered, still switched.
  }
}

function buildingLabel(building: Building) {
  return building.altName?.trim() || `${t("building.prefix")} ${building.name}`;
}

function cameraFor(
  library: MapLibreLibrary,
  map: MapLibreMap,
  view: MapView,
  target: Point,
  campus: Point[],
) {
  const { pitch, bearing } = CAMERA[view];
  const base = { center: toLngLat(target), zoom: BUILDING_ZOOM, pitch, bearing };

  if (view === "3d" || !campus.length) return base;

  const bounds = new library.LngLatBounds(toLngLat(target), toLngLat(target));

  for (const point of campus) bounds.extend(toLngLat(point));

  const fit = map.cameraForBounds(bounds, { padding: 48, maxZoom: BUILDING_ZOOM, pitch, bearing });

  return fit?.center && fit.zoom !== undefined
    ? { ...base, center: fit.center, zoom: fit.zoom }
    : base;
}

// Waits for the map to come near the viewport: a reader who never scrolls down
// to it never pays for the WebGL boot.
function useNearViewport(element: RefObject<HTMLElement | null>) {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const target = element.current;

    if (near || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: "400px 0px" },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [element, near]);

  return near;
}

// The building's pin: a labelled pill with a dot, pointing down at it. The
// campus's other buildings (2D only) are just the dot. MapLibre positions the
// element (absolute), which also anchors the pin's ::after pointer.
const MARKER =
  "inline-flex items-center gap-1.5 rounded-full font-sans text-13 font-bold whitespace-nowrap text-on-accent";

const BUILDING_MARKER = cn(
  MARKER,
  "pointer-events-none mb-1.75 h-[30px] bg-accent pr-3 pl-2.5 shadow-md",
  "after:absolute after:bottom-[-6px] after:left-1/2 after:-translate-x-1/2 after:content-['']",
  "after:border-6 after:border-b-0 after:border-transparent after:border-t-accent",
);

const OTHER_MARKER = cn(MARKER, "pointer-events-auto");

function markerElement(className: string, dotClassName: string, label?: string) {
  const element = document.createElement("div");
  const dot = document.createElement("span");

  element.className = className;
  dot.className = dotClassName;
  element.append(dot);

  if (label) {
    const text = document.createElement("span");

    text.textContent = label;
    element.append(text);
  }

  return element;
}

export default function LocationMap({
  building,
  campusBuildings,
  className,
}: {
  building: Building & Point;
  campusBuildings: Building[];
  /** The map's frame, shared with the page's loading placeholder. */
  className: string;
}) {
  const locale = useLocale();
  const theme = useTheme();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<MapLibreMarker[]>([]);
  const placed = useRef(false);
  const [library, setLibrary] = useState<MapLibreLibrary | null>(null);
  const [error, setError] = useState(false);
  const [view, setView] = useState(savedView);
  const near = useNearViewport(host);
  const label = buildingLabel(building);

  const siblings = campusBuildings.filter(
    (other): other is Building & Point => other.name !== building.name && hasCoordinates(other),
  );

  // Boot once in range. MapLibre's own strings (control tooltips, the gesture
  // hint) are fixed at construction, so a language switch rebuilds it.
  useEffect(() => {
    if (!near) return;

    let disposed = false;

    loadMapLibre()
      .then((maplibregl) => {
        if (disposed || !host.current) return;

        const map = new maplibregl.Map({
          container: host.current,
          center: toLngLat(building),
          zoom: BUILDING_ZOOM,
          maxPitch: 70,
          cooperativeGestures: true,
          locale: mapControlsLocale(),
          attributionControl: { compact: true, customAttribution: OPENFREEMAP_ATTRIBUTION },
        });

        const fullscreen = new maplibregl.FullscreenControl({});

        map.addControl(
          new maplibregl.NavigationControl({
            showZoom: true,
            showCompass: true,
            visualizePitch: true,
          }),
          "top-right",
        );
        map.addControl(fullscreen, "top-right");
        map.addControl(
          new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
          "top-right",
        );

        // Fullscreen is the map on its own, nothing to scroll past: free gestures.
        fullscreen.on("fullscreenstart", () => map.cooperativeGestures.disable());
        fullscreen.on("fullscreenend", () => map.cooperativeGestures.enable());

        onStyleFailure(map, (reason) => {
          if (disposed) return;

          console.error("Location map style failed to load", reason);
          setError(true);
        });
        applyMapTheme(map);
        mapRef.current = map;
        setLibrary(maplibregl);
      })
      .catch((reason: Error) => {
        console.error("Location map failed to load", reason);

        if (!disposed) setError(true);
      });

    return () => {
      disposed = true;
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      placed.current = false;
      setLibrary(null);
    };
    // The page keys this component by building, and camera moves happen below,
    // so only the language rebuilds the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, locale]);

  useEffect(() => {
    if (mapRef.current) applyMapTheme(mapRef.current);
  }, [theme]);

  // Markers: the building labelled; in 2D, the rest of the campus as dots.
  useEffect(() => {
    const map = mapRef.current;

    if (!map || !library) return;

    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    if (view === "2d") {
      for (const other of siblings) {
        const element = markerElement(
          OTHER_MARKER,
          "size-2.5 rounded-full border-2 border-surface bg-neutral shadow-sm",
        );

        element.title = buildingLabel(other);
        markers.current.push(
          new library.Marker({ element, anchor: "center" }).setLngLat(toLngLat(other)).addTo(map),
        );
      }
    }

    markers.current.push(
      new library.Marker({
        element: markerElement(BUILDING_MARKER, "size-2 rounded-full bg-current", label),
        anchor: "bottom",
      })
        .setLngLat(toLngLat(building))
        .addTo(map),
    );
    // `siblings` is derived from `campusBuildings` on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, view, building, campusBuildings, label]);

  // Camera: the first placement jumps (settling in from a flatter tilt in 3D,
  // so it reads as the map rising); a view switch eases between the two.
  useEffect(() => {
    const map = mapRef.current;

    if (!map || !library) return;

    const camera = cameraFor(library, map, view, building, siblings);

    if (placed.current) {
      map.easeTo({ ...camera, duration: reduceMotion.matches ? 0 : 800, essential: true });

      return;
    }

    placed.current = true;

    if (reduceMotion.matches || camera.pitch === 0) {
      map.jumpTo(camera);

      return;
    }

    map.jumpTo({ ...camera, pitch: 25 });
    map.easeTo({ pitch: camera.pitch, duration: 1200 });
    // `siblings` is derived from `campusBuildings` on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, view, building, campusBuildings]);

  function selectView(next: MapView) {
    setView(next);
    saveView(next);
  }

  return (
    <div className={cn(className, MAP_CONTROLS, LOCATION_CONTROLS)}>
      {/* Sized, not absolutely positioned: MapLibre's own stylesheet (loaded
          later) makes its container `position: relative`. */}
      <div
        className="size-full"
        ref={host}
        role="application"
        aria-label={tf("classroom.mapOf", { building: label })}
      />
      <Segmented
        className="absolute top-2.5 left-2.5 z-2 bg-surface shadow-sm"
        role="group"
        aria-label={t("classroom.mapView")}
      >
        {VIEWS.map((option) => (
          <SegmentedOption
            key={option}
            className="min-h-7 px-2.5 text-13 tabular-nums aria-pressed:bg-accent aria-pressed:text-on-accent"
            aria-pressed={view === option}
            onClick={() => selectView(option)}
          >
            {option.toUpperCase()}
          </SegmentedOption>
        ))}
      </Segmented>
      {error && (
        <div className="absolute inset-0 z-3 flex items-center justify-center gap-2 bg-surface-muted text-14 text-muted">
          <Icon name="alert-02" />
          {t("map.error")}
        </div>
      )}
    </div>
  );
}
