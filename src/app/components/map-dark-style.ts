import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

// A dark theme derived from OpenFreeMap's Liberty style at load time, rather
// than OpenFreeMap's own "Dark" style — that one is a different, bare design
// (no POI icons, no 3D buildings, near-flat contrast), so switching to it
// read as a different map, not the same one at night. Remapping Liberty's own
// colors keeps every layer, icon and extrusion the light theme has.
//
// Each layer type gets its own lightness curve, so the light theme's
// hierarchy survives the flip: land and water go dark, roads stay a step
// lighter than the land around them, labels turn light over dark halos, and
// extruded buildings sit a step above the ground.

type Kind = "fill" | "line" | "text" | "extrusion";

// A JSON string literal holding a color — Liberty's paint colors are all hex,
// rgb(a) or hsl(a), see parseColor().
const COLOR_LITERAL_RE = /"(#[0-9a-f]{3,8}|rgba?\([^")]*\)|hsla?\([^")]*\))"/gi;

interface Hsla {
  h: number;
  s: number;
  l: number;
  a: number;
}

function rgbToHsl(r: number, g: number, b: number, a: number): Hsla {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l, a };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;

  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;

  return { h: (h * 60 + 360) % 360, s, l, a };
}

function parseColor(value: string): Hsla | null {
  const v = value.trim().toLowerCase();

  if (v.startsWith("#")) {
    let hex = v.slice(1);

    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");

    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;

    return rgbToHsl(n(0), n(2), n(4), hex.length === 8 ? n(6) : 1);
  }

  const parts = v
    .slice(v.indexOf("(") + 1, -1)
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map((p) => parseFloat(p));

  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  const a = parts[3] ?? 1;

  if (v.startsWith("rgb")) return rgbToHsl(parts[0] / 255, parts[1] / 255, parts[2] / 255, a);

  return { h: parts[0], s: parts[1] / 100, l: parts[2] / 100, a };
}

function darken({ h, s, l, a }: Hsla, kind: Kind): string {
  let nl: number;
  let ns = s * 0.6;

  switch (kind) {
    case "fill":
      // Background ~0.96 → ~0.12; parks, water, landuse a shade apart.
      nl = 0.1 + (1 - l) * 0.45;
      break;
    case "line":
      // White road fills → ~0.34, their darker casings/borders lower.
      nl = 0.12 + l * 0.22;
      break;
    case "text":
      // Dark text → light, white halos → near-black.
      nl = 1 - l * 0.88;
      ns = s * 0.8;
      break;
    case "extrusion":
      nl = 0.2 + (1 - l) * 0.3;
      break;
  }

  const pct = (x: number) => `${Math.round(Math.min(1, Math.max(0, x)) * 1000) / 10}%`;

  return `hsla(${Math.round(h)}, ${pct(ns)}, ${pct(nl)}, ${a})`;
}

function kindOf(layer: LayerSpecification): Kind | null {
  switch (layer.type) {
    case "background":
    case "fill":
      return "fill";
    case "line":
      return "line";
    case "symbol":
      return "text";
    case "fill-extrusion":
      return "extrusion";
    default:
      return null;
  }
}

function darkLayer(layer: LayerSpecification): LayerSpecification {
  // Natural Earth's shaded relief (low zooms only) — dim it rather than
  // recolor it.
  if (layer.type === "raster") {
    return {
      ...layer,
      paint: { ...layer.paint, "raster-brightness-max": 0.3, "raster-saturation": -0.4 },
    };
  }

  // Sprite-pattern fills (pedestrian areas, wetland) are light bitmaps the
  // color remap can't reach — fade them to a faint texture instead.
  if (layer.type === "fill" && layer.paint?.["fill-pattern"]) {
    return { ...layer, paint: { ...layer.paint, "fill-opacity": 0.12 } };
  }

  const kind = kindOf(layer);

  if (!kind || !("paint" in layer) || !layer.paint) return layer;

  // Recolors every color literal in the layer's paint — plain values and the
  // stops inside interpolate/match/case expressions alike — by rewriting just
  // those string literals in its JSON, leaving the expression structure
  // untouched.
  const json = JSON.stringify(layer.paint).replace(COLOR_LITERAL_RE, (literal, value: string) => {
    const color = parseColor(value);

    return color ? `"${darken(color, kind)}"` : literal;
  });

  return { ...layer, paint: JSON.parse(json) };
}

// MapLibre `transformStyle` hook — see campus-map.tsx's applyTheme().
export function toDarkStyle(
  _previous: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification {
  return { ...next, layers: next.layers.map(darkLayer) };
}
