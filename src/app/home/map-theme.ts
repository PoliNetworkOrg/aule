import type {
  LayerSpecification,
  LightSpecification,
  SkySpecification,
  StyleSpecification,
} from "maplibre-gl";

// Apple Maps–leaning light and dark themes, painted over OpenFreeMap's Liberty
// style at load time. Liberty supplies the layers (and the 3D buildings,
// which OpenFreeMap's other styles lack); every color here replaces Liberty's
// own by layer id — see paintFor(). Anything a rule doesn't cover keeps
// Liberty's color, so a new upstream layer shows up as-is instead of vanishing.

export interface MapTheme {
  land: string;
  residential: string;
  park: string;
  parkOutline: string;
  wood: string;
  grass: string;
  pitch: string;
  cemetery: string;
  hospital: string;
  school: string;
  sand: string;
  ice: string;
  water: string;
  aeroway: string;
  runway: string;
  building: string;
  buildingOutline: string;
  extrusion: string;
  roadMinor: string;
  roadMinorCasing: string;
  roadMajor: string;
  roadMajorCasing: string;
  highway: string;
  highwayCasing: string;
  path: string;
  rail: string;
  boundary: string;
  labelPlace: string;
  labelRoad: string;
  labelPoi: string;
  labelTransit: string;
  labelWater: string;
  halo: string;
  // Sprite-pattern fills (pedestrian areas, wetland) are fixed light bitmaps
  // no color can reach — dark mode fades them to a faint texture.
  patternOpacity: number;
  // Natural Earth's shaded relief, shown at low zooms only.
  reliefBrightness: number;
  light: LightSpecification;
  sky: SkySpecification;
}

export const LIGHT_THEME: MapTheme = {
  land: "#f7f5f1",
  residential: "rgba(0, 0, 0, 0)",
  park: "#bfe3a7",
  parkOutline: "#a9d68e",
  wood: "#aed993",
  grass: "#c6e6ae",
  pitch: "#c9e7b4",
  cemetery: "#c8e0b4",
  hospital: "#f7dde3",
  school: "#efe9d2",
  sand: "#f4ecc8",
  ice: "#eef4f6",
  water: "#8fcbf5",
  aeroway: "#e8e6e1",
  runway: "#fbfaf8",
  building: "#e2dfd9",
  buildingOutline: "#d2cdc5",
  extrusion: "#e0ddd8",
  roadMinor: "#ffffff",
  roadMinorCasing: "#dcd9d3",
  roadMajor: "#fdf1c0",
  roadMajorCasing: "#e3cf8f",
  highway: "#f9d56e",
  highwayCasing: "#e0b24a",
  path: "#ffffff",
  rail: "#c5c3bf",
  boundary: "#a9a6b8",
  labelPlace: "#2b2d30",
  labelRoad: "#5d636b",
  labelPoi: "#6b7078",
  labelTransit: "#2f6fb3",
  labelWater: "#3f7fb8",
  halo: "#ffffff",
  patternOpacity: 1,
  reliefBrightness: 1,
  light: { anchor: "viewport", color: "#ffffff", intensity: 0.48 },
  sky: { "sky-color": "#cfe6f7", "horizon-color": "#eef4f8", "fog-color": "#f7f5f1" },
};

export const DARK_THEME: MapTheme = {
  land: "#18212b",
  residential: "rgba(0, 0, 0, 0)",
  park: "#1e3a2b",
  parkOutline: "#244533",
  wood: "#1b3828",
  grass: "#213f2e",
  pitch: "#23412f",
  cemetery: "#203a2b",
  hospital: "#3a2a33",
  school: "#262d36",
  sand: "#33322a",
  ice: "#2b3440",
  water: "#0f2c4a",
  aeroway: "#252f3b",
  runway: "#34404e",
  building: "#2d3845",
  buildingOutline: "#384554",
  extrusion: "#415064",
  roadMinor: "#3a4554",
  roadMinorCasing: "#1a212a",
  roadMajor: "#4a5566",
  roadMajorCasing: "#1a212a",
  highway: "#7d6a45",
  highwayCasing: "#3b3222",
  path: "#34404d",
  rail: "#4a5566",
  boundary: "#5d6878",
  labelPlace: "#e4e9ef",
  labelRoad: "#aab4c0",
  labelPoi: "#9ba6b3",
  labelTransit: "#7eb3ea",
  labelWater: "#6f9fd0",
  halo: "#141b23",
  patternOpacity: 0.12,
  reliefBrightness: 0.25,
  light: { anchor: "viewport", color: "#b8c8e0", intensity: 0.45 },
  sky: { "sky-color": "#0d1826", "horizon-color": "#1d2a3a", "fog-color": "#18212b" },
};

type Paint = Record<string, string | number>;

// Liberty's road layers come in tunnel_/road_/bridge_ variants of the same
// classes, each with a `_casing` twin — matched by class, whatever the prefix.
function roadPaint(id: string, t: MapTheme): Paint | null {
  if (/rail/.test(id)) return { "line-color": t.rail };

  if (id.endsWith("_casing")) {
    if (/motorway/.test(id)) return { "line-color": t.highwayCasing };

    if (/(trunk|primary|secondary|tertiary|link)/.test(id)) {
      return { "line-color": t.roadMajorCasing };
    }

    return { "line-color": t.roadMinorCasing };
  }

  if (/motorway/.test(id)) return { "line-color": t.highway };

  if (/(trunk_primary|secondary_tertiary|_link)$/.test(id)) return { "line-color": t.roadMajor };

  if (id.endsWith("path_pedestrian")) return { "line-color": t.path };

  if (/(minor|service_track|street)$/.test(id)) return { "line-color": t.roadMinor };

  return null;
}

function labelPaint(id: string, t: MapTheme) {
  let color = t.labelPoi;

  if (id.startsWith("label_")) color = t.labelPlace;
  else if (id.startsWith("highway-name")) color = t.labelRoad;
  else if (id === "poi_transit") color = t.labelTransit;
  else if (id.startsWith("water")) color = t.labelWater;

  return { "text-color": color, "text-halo-color": t.halo };
}

const FILLS: [RegExp, (t: MapTheme) => Paint][] = [
  // Liberty draws parks and landcover translucent (0.3–0.7), which is what
  // washed the greens out — opaque here, Apple Maps–style.
  [
    /^park$/,
    (t) => ({ "fill-color": t.park, "fill-outline-color": t.parkOutline, "fill-opacity": 1 }),
  ],
  [/^landuse_residential$/, (t) => ({ "fill-color": t.residential })],
  [/^landcover_wood$/, (t) => ({ "fill-color": t.wood, "fill-opacity": 0.9 })],
  [/^landcover_grass$/, (t) => ({ "fill-color": t.grass, "fill-opacity": 0.85 })],
  [/^landcover_ice$/, (t) => ({ "fill-color": t.ice })],
  [/^landcover_sand$/, (t) => ({ "fill-color": t.sand })],
  [/^landuse_(pitch|track)$/, (t) => ({ "fill-color": t.pitch })],
  [/^landuse_cemetery$/, (t) => ({ "fill-color": t.cemetery })],
  [/^landuse_hospital$/, (t) => ({ "fill-color": t.hospital })],
  [/^landuse_school$/, (t) => ({ "fill-color": t.school })],
  [/^water$/, (t) => ({ "fill-color": t.water })],
  [/^aeroway_fill$/, (t) => ({ "fill-color": t.aeroway })],
  [/^building$/, (t) => ({ "fill-color": t.building, "fill-outline-color": t.buildingOutline })],
];

function paintFor(layer: LayerSpecification, t: MapTheme): Paint | null {
  const { id } = layer;

  switch (layer.type) {
    case "background":
      return { "background-color": t.land };
    case "raster":
      return { "raster-brightness-max": t.reliefBrightness };
    case "fill-extrusion":
      return { "fill-extrusion-color": t.extrusion, "fill-extrusion-opacity": 1 };
    case "symbol":
      return labelPaint(id, t);
    case "fill":
      if (layer.paint?.["fill-pattern"]) return { "fill-opacity": t.patternOpacity };

      return FILLS.find(([re]) => re.test(id))?.[1](t) ?? null;
    case "line":
      if (id === "park_outline") return { "line-color": t.parkOutline };

      if (id.startsWith("waterway")) return { "line-color": t.water };

      if (id.startsWith("aeroway")) return { "line-color": t.runway };

      if (id.startsWith("boundary")) return { "line-color": t.boundary };

      return roadPaint(id, t);
    default:
      return null;
  }
}

function themedLayer(layer: LayerSpecification, t: MapTheme): LayerSpecification {
  const paint = paintFor(layer, t);

  if (!paint) return layer;

  // SAFETY: paintFor() only returns paint keys valid for the layer's own
  // `type` (it switches on it), with plain color/number values those keys
  // accept.
  return { ...layer, paint: { ...layer.paint, ...paint } } as LayerSpecification;
}

// MapLibre `transformStyle` hook — see campus-map.tsx's applyTheme().
export function themedStyle(t: MapTheme) {
  return (_previous: StyleSpecification | undefined, next: StyleSpecification) => ({
    ...next,
    light: t.light,
    sky: t.sky,
    layers: next.layers.map((layer) => themedLayer(layer, t)),
  });
}
