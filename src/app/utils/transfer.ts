// Device-to-device transfer of favourites + preferences, with no backend.
//
// The sending device packs a fixed list of localStorage keys into a short JSON
// payload and puts it in a link: `${origin}/#import=<base64url>`, shown as a
// QR code (components/transfer-dialog.tsx). Scanning it with the other
// device's camera opens the app, which validates the payload and asks before
// writing.
// The data stays in the URL fragment, so it never reaches a server.
//
// Only the fields in fields() travel. Device-specific or throwaway state stays
// put: caches, last tab / last campus, and any dev-only flags. Anything else
// in a payload is ignored, so a crafted link can't write arbitrary keys.
import type { Campus } from "../types";
import { isNumber } from "../../lib/guards";
import { getFavouriteIds, setFavouriteIds } from "./favourites";
import { STORAGE_KEY as TIME_FORMAT_KEY } from "./time-format";
import { STORAGE_KEY as LOCALE_KEY } from "../i18n";
import {
  HIDE_SUNDAYS_KEY,
  INTERVAL_HOURS_KEY,
  SHOW_PARTIAL_KEY,
  AUTO_SEARCH_KEY,
  LIVE_SEARCH_KEY,
  DEFAULT_TAB_KEY,
  PREFERRED_CAMPUS_ENABLED_KEY,
  PREFERRED_CAMPUS_ID_KEY,
  REMEMBER_LAST_CAMPUS_KEY,
} from "../components/settings-preferences";

const VERSION = 1;

const HASH_PREFIX = "#import=";

// Every codec encodes a raw localStorage string into the compact payload
// representation (a string or number) and decodes it back, so `fields()`
// below can hold a uniform value type regardless of which codec a key uses.
interface Codec {
  enc(value: string): string | number | undefined;
  dec(value: string | number): string | undefined;
}

const bool: Codec = {
  enc: (v) => (v === "true" ? 1 : v === "false" ? 0 : undefined),
  dec: (x) => (x === 0 || x === 1 ? String(x === 1) : undefined),
};

function isCodecString(value: string | number): value is string {
  return typeof value === "string";
}

const oneOf = (...values: string[]): Codec => ({
  enc: (v) => (values.includes(v) ? v : undefined),
  dec: (x) => (isCodecString(x) && values.includes(x) ? x : undefined),
});

const intIn = (min: number, max: number): Codec => ({
  enc: (v) => {
    const n = Number(v);

    return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
  },
  dec: (x) => (isNumber(x) && Number.isInteger(x) && x >= min && x <= max ? String(x) : undefined),
});

type FieldEntry = [string, Codec];

// Built on demand, not at module load: settings.tsx imports this module's
// dialog (components/transfer-dialog.tsx), so its key constants aren't
// initialised yet while this file first evaluates.
function fields(campusIds: string[] | null) {
  return {
    l: [LOCALE_KEY, oneOf("en", "it")],
    tf: [TIME_FORMAT_KEY, oneOf("system", "12", "24")],
    hs: [HIDE_SUNDAYS_KEY, bool],
    ih: [INTERVAL_HOURS_KEY, intIn(1, 12)],
    sp: [SHOW_PARTIAL_KEY, bool],
    as: [AUTO_SEARCH_KEY, bool],
    ls: [LIVE_SEARCH_KEY, bool],
    dt: [DEFAULT_TAB_KEY, oneOf("available", "search", "last")],
    pe: [PREFERRED_CAMPUS_ENABLED_KEY, bool],
    pc: [
      PREFERRED_CAMPUS_ID_KEY,
      campusIds
        ? oneOf(...campusIds)
        : ({ enc: (v) => v || undefined, dec: (x) => String(x) } satisfies Codec),
    ],
    rl: [REMEMBER_LAST_CAMPUS_KEY, bool],
  } satisfies Record<string, FieldEntry>;
}

function toBase64Url(str: string) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";

  for (const b of bytes) bin += String.fromCharCode(b);

  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64: string) {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));

  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

type PayloadValue = number | number[] | string;

// The transfer link for this device's current state. Unset keys are left out,
// so the receiving device keeps its own defaults for them.
export function buildTransferUrl() {
  const entries: [string, PayloadValue][] = [["v", VERSION]];
  const favs = getFavouriteIds();

  if (favs.length) entries.push(["f", favs]);

  for (const [short, [key, codec]] of Object.entries(fields(null))) {
    const raw = readStorage(key);

    if (raw === null) continue;
    const value = codec.enc(raw);

    if (value !== undefined) entries.push([short, value]);
  }

  const payload = Object.fromEntries(entries);

  return `${location.origin}/${HASH_PREFIX}${toBase64Url(JSON.stringify(payload))}`;
}

// If the page was opened from a transfer link, removes the fragment (so a
// reload doesn't import again, and the hash routers never see it) and returns
// the raw payload. Returns null otherwise. Call before anything reads the hash.
export function takeImportHash() {
  if (!location.hash.startsWith(HASH_PREFIX)) return null;
  const raw = location.hash.slice(HASH_PREFIX.length);

  history.replaceState(null, "", location.pathname + location.search);

  return raw;
}

export interface ParsedTransfer {
  favourites: number[];
  settings: Record<string, string>;
}

// Named type guards, not inline `typeof` checks, establish the contract for
// values coming out of an untrusted JSON payload. Each field is still
// individually validated below (VERSION check, codec decode, classroom-id
// membership) before use, so a value that doesn't actually match
// `PayloadValue` here is simply dropped rather than trusted.
function isPayloadRecord(value: unknown): value is Record<string, PayloadValue> {
  return typeof value === "object" && value !== null;
}

function isEncodedValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function isFavouriteId(value: unknown, classroomIds: Set<number>): value is number {
  return typeof value === "number" && Number.isInteger(value) && classroomIds.has(value);
}

// Validates a payload against the classroom directory. Returns
// { favourites, settings }, or null when the payload can't be read at all.
// Individual bad fields are dropped.
export function parseTransfer(raw: string, classroomsData: Campus[] | null): ParsedTransfer | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(fromBase64Url(raw));
  } catch {
    return null;
  }

  if (!isPayloadRecord(parsed) || parsed.v !== VERSION) return null;

  const campusIds = (classroomsData ?? []).map((c) => c.id);

  const classroomIds = new Set(
    (classroomsData ?? []).flatMap((c) =>
      c.buildings.flatMap((b) => b.classrooms.map((r) => r.id)),
    ),
  );

  const rawFavourites = parsed.f;

  const favourites = Array.isArray(rawFavourites)
    ? [...new Set(rawFavourites.filter((id) => isFavouriteId(id, classroomIds)))]
    : [];

  const settings: Record<string, string> = {};

  for (const [short, [key, codec]] of Object.entries(fields(campusIds))) {
    if (!(short in parsed)) continue;
    const rawValue = parsed[short];

    if (!isEncodedValue(rawValue)) continue;
    const value = codec.dec(rawValue);

    if (value !== undefined) settings[key] = value;
  }

  if (!favourites.length && !Object.keys(settings).length) return null;

  return { favourites, settings };
}

// Writes a parsed transfer. `favouritesMode` is 'merge' (keep this device's
// favourites and add the incoming ones) or 'replace'. The caller reloads
// afterwards: most settings are only read at start-up.
export function applyTransfer(
  { favourites, settings }: ParsedTransfer,
  { favouritesMode = "merge" }: { favouritesMode?: "merge" | "replace" } = {},
) {
  if (favourites.length) {
    const next =
      favouritesMode === "replace"
        ? favourites
        : [...new Set([...getFavouriteIds(), ...favourites])];

    setFavouriteIds(next);
  }

  for (const [key, value] of Object.entries(settings)) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage full or unavailable */
    }
  }
}
