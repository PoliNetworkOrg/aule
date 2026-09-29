import { useSyncExternalStore } from "react";
import { defaultWindow, normaliseWindow } from "./time";

// The whole home screen is driven by this one store: what the user is looking
// for (campus, day, time window, filters, free-text query) plus the data
// lifecycle. Components read slices with useStore(); writes go through the
// setters below, which also persist the choices worth remembering.

export type LoadStatus = "loading" | "ready" | "error";

export type ResultsView = "list" | "map";

export type SeatsFilter = 0 | 30 | 60 | 100 | 200;

export interface Filters {
  /** Hide rooms that are only free for part of the window. */
  fullyFree: boolean;
  /** Feature 142: seats with power sockets. */
  sockets: boolean;
  /** At least one seat reserved for wheelchair users. */
  accessible: boolean;
  /** Feature 143: seats with a wired network socket. */
  network: boolean;
  minSeats: SeatsFilter;
  /** Restrict results to one building (by name) of the selected campus. */
  building: string;
}

export interface AppState {
  directory: LoadStatus;
  occupancy: LoadStatus;
  /** Bumped whenever occupancy data is (re)loaded, so derived data recomputes. */
  dataRevision: number;
  generatedAt: Date | null;
  campusId: string;
  date: string;
  from: string;
  to: string;
  filters: Filters;
  query: string;
  view: ResultsView;
  /** Building focused on the 3D map (by name), shown in the map's side panel. */
  mapBuilding: string | null;
}

export const DEFAULT_FILTERS: Filters = {
  fullyFree: false,
  sockets: false,
  accessible: false,
  network: false,
  minSeats: 0,
  building: "",
};

const CAMPUS_KEY = "poliAule_lastCampusId";

const FILTERS_KEY = "poliAule_filters";

const LEGACY_SHOW_PARTIAL_KEY = "poliAule_showPartial";

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

    for (const key of ["fullyFree", "sockets", "accessible", "network"] as const) {
      if (saved[key] === true) filters[key] = true;
    }

    const seats = Number(saved.minSeats);

    if (isSeatsFilter(seats)) filters.minSeats = seats;
  } catch {
    /* corrupted value: fall back to defaults */
  }

  // The old settings panel stored "show partially free" separately.
  if (readStorage(FILTERS_KEY) === null && readStorage(LEGACY_SHOW_PARTIAL_KEY) === "false")
    filters.fullyFree = true;

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

const initialWindow = defaultWindow(false);

let state: AppState = {
  directory: "loading",
  occupancy: "loading",
  dataRevision: 0,
  generatedAt: null,
  campusId: readInitialCampus(),
  date: "",
  from: initialWindow.from,
  to: initialWindow.to,
  filters: readFilters(),
  query: "",
  view: "list",
  mapBuilding: null,
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

export function setCampus(campusId: string) {
  if (campusId === state.campusId) return;
  writeStorage(CAMPUS_KEY, campusId);
  setState({
    campusId,
    mapBuilding: null,
    filters: { ...state.filters, building: "" },
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
    Number(filters.fullyFree) +
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
