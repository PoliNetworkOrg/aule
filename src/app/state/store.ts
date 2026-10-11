import { useSyncExternalStore } from "react";
import {
  DAY_END,
  defaultWindow,
  fromMinutes,
  normaliseWindow,
  STEP_MINUTES,
  toMinutes,
} from "./time";

// The whole home screen is driven by this one store: what the user is looking
// for (campuses, day, time window, filters, free-text query) plus the data
// lifecycle. Components read slices with useStore(); writes go through the
// setters below, which also persist the choices worth remembering.

export type LoadStatus = "loading" | "ready" | "error";

export type ResultsView = "list" | "map";

export type SeatsFilter = 0 | 30 | 60 | 100 | 200;

export interface Filters {
  /** Also list rooms that are free for only part of the window. */
  partial: boolean;
  /** Feature 142: seats with power sockets. */
  sockets: boolean;
  /** At least one seat reserved for wheelchair users. */
  accessible: boolean;
  /** Feature 143: seats with a wired network socket. */
  network: boolean;
  minSeats: SeatsFilter;
  /** Restrict results to one building (by buildingKey) of the selected campuses. */
  building: string;
}

export interface AppState {
  directory: LoadStatus;
  occupancy: LoadStatus;
  /** False when /v1/opening-hours never loaded: closed buildings can't be told apart. */
  openingHours: boolean;
  /** Bumped whenever occupancy data is (re)loaded, so derived data recomputes. */
  dataRevision: number;
  generatedAt: Date | null;
  /** Never empty, in directory order (see sortCampuses). */
  campusIds: string[];
  date: string;
  from: string;
  to: string;
  filters: Filters;
  query: string;
  view: ResultsView;
  /** Building focused on the 3D map (by buildingKey), shown in the map's side panel. */
  mapBuilding: string | null;
  /** Phones/tablets: controls folded into a one-line summary while browsing results. */
  controlsCollapsed: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  partial: false,
  sockets: false,
  accessible: false,
  network: false,
  minSeats: 0,
  building: "",
};

// The selection, as a JSON array. The single campus of older versions is still
// written to CAMPUS_KEY (first selected one), so rolling back keeps a valid choice.
const CAMPUSES_KEY = "poliAule_campusIds";

const CAMPUS_KEY = "poliAule_lastCampusId";

// v2: rooms free for the whole window are the default, partially free ones opt-in.
const FILTERS_KEY = "poliAule_filters_v2";

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
}

function isSeatsFilter(value: number): value is SeatsFilter {
  return [0, 30, 60, 100, 200].includes(value);
}

function readFilters(): Filters {
  const filters = { ...DEFAULT_FILTERS };

  try {
    const saved: Partial<Record<keyof Filters, boolean | number | string>> = JSON.parse(
      readStorage(FILTERS_KEY) ?? "{}",
    );

    for (const key of ["partial", "sockets", "accessible", "network"] as const) {
      if (saved[key] === true) filters[key] = true;
    }

    const seats = Number(saved.minSeats);

    if (isSeatsFilter(seats)) filters.minSeats = seats;
  } catch {
    /* corrupted value: fall back to defaults */
  }

  return filters;
}

/** Last campus used. The old settings panel could pin a "preferred" one: adopt it once. */
function readInitialCampus() {
  const preferred = readStorage("poliAule_preferredCampusId");

  if (readStorage("poliAule_preferredCampusEnabled") === "true" && preferred) {
    writeStorage(CAMPUS_KEY, preferred);
    writeStorage("poliAule_preferredCampusEnabled", "false");
  }

  return readStorage(CAMPUS_KEY) ?? "MIA01";
}

/** The saved selection, or the last single campus of older versions. Unknown ids are dropped at boot. */
export function readInitialCampuses(): string[] {
  try {
    const saved: unknown = JSON.parse(readStorage(CAMPUSES_KEY) ?? "null");

    if (
      Array.isArray(saved) &&
      saved.length > 0 &&
      saved.every((id): id is string => typeof id === "string")
    )
      return saved;
  } catch {
    /* corrupted value: fall back to the single campus */
  }

  return [readInitialCampus()];
}

/** Buildings are named per campus ("8" exists in Leonardo and Lecco), so they're keyed by both. */
export function buildingKey(campusId: string, name: string) {
  return `${campusId}/${name}`;
}

export function splitBuildingKey(key: string) {
  const slash = key.indexOf("/");

  return { campusId: key.slice(0, slash), name: key.slice(slash + 1) };
}

/** `ids` deduplicated, in the order of `order` (the directory's); ids not in it go last. */
export function sortCampuses(ids: string[], order: string[]) {
  const rank = (id: string) => {
    const index = order.indexOf(id);

    return index === -1 ? order.length : index;
  };

  return [...new Set(ids)].sort((a, b) => rank(a) - rank(b));
}

/**
 * The selection after toggling `ids` on (`selected`) or off. Turning off is
 * ignored when it would leave nothing selected.
 */
export function toggledCampuses(
  current: string[],
  ids: string[],
  selected: boolean,
  order: string[],
) {
  const next = selected ? [...current, ...ids] : current.filter((id) => !ids.includes(id));

  return next.length ? sortCampuses(next, order) : current;
}

const initialWindow = defaultWindow(false);

let state: AppState = {
  directory: "loading",
  occupancy: "loading",
  openingHours: true,
  dataRevision: 0,
  generatedAt: null,
  campusIds: readInitialCampuses(),
  date: "",
  from: initialWindow.from,
  to: initialWindow.to,
  filters: readFilters(),
  query: "",
  view: "list",
  mapBuilding: null,
  controlsCollapsed: false,
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getState() {
  return state;
}

export function setState(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function readState() {
  return state;
}

export function useStore<T>(selector: (current: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getState()));
}

/** Replaces the selection (never empty). A building of a campus left out stops being filtered on or focused. */
export function setCampuses(campusIds: string[]) {
  if (!campusIds.length || campusIds.join() === state.campusIds.join()) return;

  writeStorage(CAMPUSES_KEY, JSON.stringify(campusIds));
  writeStorage(CAMPUS_KEY, campusIds[0]);

  const kept = (key: string | null) => !!key && campusIds.includes(splitBuildingKey(key).campusId);

  setState({
    campusIds,
    mapBuilding: kept(state.mapBuilding) ? state.mapBuilding : null,
    filters: kept(state.filters.building) ? state.filters : { ...state.filters, building: "" },
  });
}

export function setDate(date: string) {
  setState({ date });
}

export function setWindow(from: string, to: string, changed: "from" | "to") {
  setState(normaliseWindow(from, to, changed));
}

export function setFilters(patch: Partial<Filters>) {
  const filters = { ...state.filters, ...patch };
  // The building filter only makes sense for the current campus, so it isn't kept.
  const { building: _building, ...persisted } = filters;

  writeStorage(FILTERS_KEY, JSON.stringify(persisted));
  setState({ filters });
}

export function resetFilters() {
  setFilters(DEFAULT_FILTERS);
}

export function setQuery(query: string) {
  setState({ query });
}

export function setView(view: ResultsView) {
  setState({ view, mapBuilding: view === "list" ? null : state.mapBuilding });
}

export function setMapBuilding(mapBuilding: string | null) {
  setState({ mapBuilding });
}

export function countActiveFilters(filters: Filters) {
  return (
    Number(filters.partial) +
    Number(filters.sockets) +
    Number(filters.accessible) +
    Number(filters.network) +
    Number(filters.minSeats > 0) +
    Number(filters.building !== "")
  );
}

/** Filters that live behind "More filters", counted for that button's badge. */
export function countAdvancedFilters(filters: Filters) {
  return Number(filters.network) + Number(filters.minSeats > 0) + Number(filters.building !== "");
}

/** Filters that narrow the results down, in the order their chips appear. */
export const RESTRICTIVE_FILTERS = [
  "sockets",
  "accessible",
  "minSeats",
  "building",
  "network",
] as const;

export type RestrictiveFilter = (typeof RESTRICTIVE_FILTERS)[number];

export function isFilterActive(filters: Filters, key: RestrictiveFilter) {
  return key === "minSeats"
    ? filters.minSeats > 0
    : key === "building"
      ? filters.building !== ""
      : filters[key];
}

export function clearFilter(key: RestrictiveFilter) {
  setFilters({ [key]: DEFAULT_FILTERS[key] });
}

export function setDuration(minutes: number) {
  const from = toMinutes(state.from);
  const end = Math.min(from + minutes, DAY_END);

  setState({ to: fromMinutes(Math.max(end, from + STEP_MINUTES)) });
}

export function setControlsCollapsed(controlsCollapsed: boolean) {
  if (controlsCollapsed !== state.controlsCollapsed) setState({ controlsCollapsed });
}
