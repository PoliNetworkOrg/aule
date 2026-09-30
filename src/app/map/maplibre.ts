import type { ErrorEvent as MapErrorEvent, Map as MapLibreMap } from "maplibre-gl";
import { isNumber } from "../../lib/guards";
import { t } from "../i18n";
import { getTheme } from "../theme";
import { DARK_THEME, LIGHT_THEME, themedStyle } from "./map-theme";

// Shared plumbing for the app's MapLibre maps (the campus map on the home page,
// the location map on a classroom page): loading the library, the OpenFreeMap
// style and its light/dark repaint.

export type MapLibreLibrary = typeof import("maplibre-gl");

export type LngLat = [number, number];

// OpenFreeMap (openfreemap.org): free, keyless, no usage caps. Liberty is the
// only one of its styles with 3D buildings; both themes repaint it at load
// time (see map-theme.ts).
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// MapLibre only lists a source's attribution once it has marked that source as
// rendered and can skip the re-check, leaving the license-required OSM credit
// blank, so maps pin it (same string as the tiles' TileJSON; MapLibre dedupes
// the two).
export const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

export const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

export function hasCoordinates(value: {
  lat?: number;
  long?: number;
}): value is { lat: number; long: number } {
  return isNumber(value.lat) && isNumber(value.long);
}

export function toLngLat(point: { lat: number; long: number }): LngLat {
  return [point.long, point.lat];
}

let mapLibrePromise: Promise<MapLibreLibrary> | null = null;

// MapLibre's worker and stylesheet are loaded by URL (`?worker&url`, `?url`):
// the library's own `new URL("./maplibre-gl-worker.mjs", import.meta.url)` is a
// path Vite neither pre-bundles nor emits, and with `cssCodeSplit: false` a
// plain stylesheet import would fold into the shell CSS every page loads.
export function loadMapLibre() {
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
export function applyMapTheme(map: MapLibreMap) {
  map.setStyle(STYLE_URL, {
    transformStyle: themedStyle(getTheme() === "dark" ? DARK_THEME : LIGHT_THEME),
  });
}

// setStyle() reports a failed style request (OpenFreeMap down, offline) through
// the `error` event rather than throwing. Any error before the first style
// load is that failure; later ones (a missed tile or sprite) are routine and
// leave the map usable.
export function onStyleFailure(map: MapLibreMap, handler: (error: MapErrorEvent["error"]) => void) {
  let styleLoaded = false;

  map.once("style.load", () => {
    styleLoaded = true;
  });
  map.on("error", (event) => {
    if (!styleLoaded) handler(event.error);
  });
}

/** MapLibre's own UI strings (control tooltips, gesture hints) in the current language. */
export function mapControlsLocale() {
  const keys = [
    "AttributionControl.ToggleAttribution",
    "FullscreenControl.Enter",
    "FullscreenControl.Exit",
    "GeolocateControl.FindMyLocation",
    "GeolocateControl.LocationNotAvailable",
    "NavigationControl.ResetBearing",
    "NavigationControl.ZoomIn",
    "NavigationControl.ZoomOut",
    "CooperativeGesturesHandler.WindowsHelpText",
    "CooperativeGesturesHandler.MacHelpText",
    "CooperativeGesturesHandler.MobileHelpText",
  ];

  return Object.fromEntries(keys.map((key) => [key, t(`maplibre.${key}`)]));
}
