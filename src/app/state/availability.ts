import {
  classroomsData as occupancyDays,
  getHolidayPeriods,
  SKIP_DAYS,
} from "../available-rooms-script";
import { classroomsData as directory } from "../classroom-search-data";
import type { Building, Campus, Classroom, Occupation } from "../types";
import {
  DEFAULT_FILTERS,
  isFilterActive,
  RESTRICTIVE_FILTERS,
  type Filters,
  type RestrictiveFilter,
} from "./store";
import {
  DAY_END,
  DAY_START,
  dateKeyToIso,
  isoToDateKey,
  parseIsoDate,
  fromMinutes,
  romeTodayIso,
  toMinutes,
} from "./time";

export type OpenWindowStatus = "free" | "partial" | "occupied";

/** `closed`: the building is shut for the whole window, whatever the bookings say. */
export type WindowStatus = OpenWindowStatus | "closed";

/**
 * When a building is open on one day. `null` means its hours never loaded: the
 * building is then treated as open, so a failed /v1/opening-hours request can't
 * hide every room (the UI says so, see hasOpeningHours).
 */
export type BuildingOpening = { closed: true } | { closed?: false; opens: string; closes: string };

export interface FreeSlot {
  start: string;
  end: string;
}

export interface RoomAvailability {
  room: Classroom;
  building: Building;
  status: OpenWindowStatus;
  /** Free intervals inside the searched window. */
  slots: FreeSlot[];
  /** Total free minutes inside the searched window. */
  freeMinutes: number;
}

interface WindowAvailability {
  status: WindowStatus;
  slots: FreeSlot[];
}

export interface BuildingAvailability {
  building: Building;
  rooms: RoomAvailability[];
  /** Rooms in the building before filters, for "n of m" counts. */
  total: number;
}

export interface ClassroomEntry {
  room: Classroom;
  building: Building;
  campus: Campus;
}

let entryIndex: Map<number, ClassroomEntry> | null = null;

let slugIndex: Map<string, ClassroomEntry> | null = null;

function buildIndexes() {
  if (entryIndex || !directory) return;
  entryIndex = new Map();
  slugIndex = new Map();

  for (const campus of directory)
    for (const building of campus.buildings)
      for (const room of building.classrooms) {
        const entry = { room, building, campus };

        entryIndex.set(room.id, entry);
        slugIndex.set(`${campus.slug}\u0000${room.name.toLowerCase()}`, entry);
      }
}

export function findClassroom(id: number) {
  buildIndexes();

  return entryIndex?.get(id) ?? null;
}

export function findClassroomBySlug(campusSlug: string, name: string) {
  buildIndexes();

  return slugIndex?.get(`${campusSlug.toLowerCase()}\u0000${name.toLowerCase()}`) ?? null;
}

export function classroomPath(entry: ClassroomEntry) {
  return entry.campus.slug
    ? `/classroom/${entry.campus.slug}/${encodeURIComponent(entry.room.name)}`
    : `/classroom/${entry.room.id}`;
}

export function campuses() {
  return (directory ?? []).filter((campus) => campus.buildings.length > 0);
}

export function findCampus(id: string) {
  return campuses().find((campus) => campus.id === id) ?? null;
}

/** Days with occupancy data, as ISO dates, in order. Sundays are skipped: buildings are closed. */
export function availableDates() {
  return occupancyDays
    .map((day) => dateKeyToIso(day.date))
    .filter((date) => date >= romeTodayIso() && !SKIP_DAYS.includes(parseIsoDate(date).getDay()));
}

/** Opening hours of `building` on an ISO date: holidays and weekdays it never opens are closed. */
export function buildingOpening(
  building: Building | undefined,
  isoDate: string,
): BuildingOpening | null {
  const hours = building?.hours;

  if (!hours) return null;

  if (getHolidayPeriods().some((period) => period.start <= isoDate && isoDate <= period.end))
    return { closed: true };

  const weekday = parseIsoDate(isoDate).getDay();
  const range = hours[weekday === 0 ? "sun" : weekday === 6 ? "sat" : "mon_fri"];

  return range ? { opens: range[0], closes: range[1] } : { closed: true };
}

/** [from, to] narrowed to the opening hours, or null when the building is shut for all of it. */
function clipToOpening(opening: BuildingOpening | null, from: string, to: string) {
  if (!opening) return { from, to };

  if (opening.closed) return null;

  const start = from > opening.opens ? from : opening.opens;
  const end = to < opening.closes ? to : opening.closes;

  return start < end ? { from: start, to: end } : null;
}

/**
 * One room on one ISO date: its bookings and its building's opening hours.
 * Null when that day has no data. A room missing from the day's data has no bookings.
 */
export function roomDay(roomId: number, isoDate: string) {
  const day = occupancyDays.find((entry) => entry.date === isoToDateKey(isoDate));

  if (!day) return null;

  for (const campus of day.campuses)
    for (const building of campus.buildings)
      for (const room of building.classrooms)
        if (room.id === roomId)
          return {
            occupancy: room.occupancy ?? [],
            opening: buildingOpening(building, isoDate),
          };

  return { occupancy: [], opening: null };
}

/** Free intervals of `occupancy` inside [from, to]. */
export function freeSlots(occupancy: Occupation[], from: string, to: string): FreeSlot[] {
  const slots: FreeSlot[] = [];
  let cursor = from;

  const sorted = occupancy
    .map((slot) => ({ start: slot.inizio, end: slot.fine }))
    .sort((a, b) => a.start.localeCompare(b.start));

  for (const slot of sorted) {
    if (slot.end <= cursor) continue;

    if (slot.start >= to) break;

    if (slot.start > cursor) slots.push({ start: cursor, end: slot.start });

    if (slot.end > cursor) cursor = slot.end;
  }

  if (cursor < to) slots.push({ start: cursor, end: to });

  return slots;
}

export function windowStatus(slots: FreeSlot[], from: string, to: string): OpenWindowStatus {
  if (!slots.length) return "occupied";

  return slots.length === 1 && slots[0].start === from && slots[0].end === to ? "free" : "partial";
}

function slotMinutes(slots: FreeSlot[]) {
  return slots.reduce((sum, slot) => sum + toMinutes(slot.end) - toMinutes(slot.start), 0);
}

/**
 * A room's status for [from, to]. Free time only counts while the building is
 * open, so a window running past opening or closing is at best partly free.
 * Results, favourites, the map and the room page all go through this.
 */
function windowAvailability(
  occupancy: Occupation[],
  opening: BuildingOpening | null,
  from: string,
  to: string,
): WindowAvailability {
  const open = clipToOpening(opening, from, to);

  if (!open) return { status: "closed", slots: [] };

  const slots = freeSlots(occupancy, open.from, open.to);

  return { status: windowStatus(slots, from, to), slots };
}

function hasFeature(room: Classroom, ids: number[]) {
  return (room.features ?? []).some((feature) => ids.includes(feature.id));
}

export function matchesFilters(room: Classroom, filters: Filters) {
  if (filters.sockets && !hasFeature(room, [142])) return false;

  if (filters.network && !hasFeature(room, [143])) return false;

  if (filters.accessible && !room.accessible_seats) return false;

  if (filters.minSeats && (room.seats ?? 0) < filters.minSeats) return false;

  return true;
}

/**
 * Rooms of a campus that are free for at least part of [from, to] on `isoDate`
 * (partially free ones included regardless of the `partial` filter: see visibleResults),
 * grouped by building. Room metadata (seats, features) comes from the static
 * directory; occupancy from the day's data.
 */
export function findAvailability(
  campusId: string,
  isoDate: string,
  from: string,
  to: string,
  filters: Filters,
): BuildingAvailability[] {
  const day = occupancyDays.find((entry) => entry.date === isoToDateKey(isoDate));
  const campus = day?.campuses.find((entry) => entry.id === campusId);

  if (!campus) return [];

  buildIndexes();

  const results: BuildingAvailability[] = [];

  for (const building of campus.buildings) {
    if (filters.building && building.name !== filters.building) continue;

    const opening = buildingOpening(building, isoDate);
    const rooms: RoomAvailability[] = [];

    for (const occupied of building.classrooms) {
      const entry = entryIndex?.get(occupied.id);
      const room = entry?.room ?? occupied;

      if (!matchesFilters(room, filters)) continue;

      const { status, slots } = windowAvailability(occupied.occupancy ?? [], opening, from, to);

      if (status === "occupied" || status === "closed") continue;

      rooms.push({
        room,
        building: entry?.building ?? building,
        status,
        slots,
        freeMinutes: slotMinutes(slots),
      });
    }

    if (!rooms.length) continue;

    rooms.sort(
      (a, b) =>
        Number(a.status === "partial") - Number(b.status === "partial") ||
        b.freeMinutes - a.freeMinutes ||
        a.room.name.localeCompare(b.room.name, undefined, { numeric: true }),
    );
    results.push({ building, rooms, total: building.classrooms.length });
  }

  return results;
}

/** A room's availability for the given window, for favourites and single-room views. */
export function roomWindowStatus(roomId: number, isoDate: string, from: string, to: string) {
  const day = roomDay(roomId, isoDate);

  if (!day) return null;

  return windowAvailability(day.occupancy, day.opening, from, to);
}

/** Names of the campus buildings that are shut for the whole window, for map and empty states. */
export function closedBuildings(campusId: string, isoDate: string, from: string, to: string) {
  const day = occupancyDays.find((entry) => entry.date === isoToDateKey(isoDate));
  const campus = day?.campuses.find((entry) => entry.id === campusId);
  const closed = new Set<string>();

  for (const building of campus?.buildings ?? [])
    if (!clipToOpening(buildingOpening(building, isoDate), from, to)) closed.add(building.name);

  return closed;
}

/** Whether every building the day has data for on this campus is shut for the whole window. */
export function campusClosed(campusId: string, isoDate: string, from: string, to: string) {
  const day = occupancyDays.find((entry) => entry.date === isoToDateKey(isoDate));
  const buildings = day?.campuses.find((entry) => entry.id === campusId)?.buildings ?? [];

  return (
    buildings.length > 0 &&
    buildings.every((building) => !clipToOpening(buildingOpening(building, isoDate), from, to))
  );
}

export type NowDetail =
  | "opensAt"
  | "closesAt"
  | "closedToday"
  | "freeFrom"
  | "freeUntil"
  | "freeRestOfDay";

export interface NowStatus {
  state: "closed" | "busy" | "free";
  detail: NowDetail | null;
  time?: string;
}

/** A room's state at `now` ("HH:MM") on `isoDate`, or null when unknown or outside the grid. */
export function roomNowStatus(roomId: number, isoDate: string, now: string): NowStatus | null {
  const day = roomDay(roomId, isoDate);

  if (!day) return null;

  const { occupancy, opening } = day;

  if (opening?.closed) return { state: "closed", detail: "closedToday" };

  if (opening && now < opening.opens)
    return { state: "closed", detail: "opensAt", time: opening.opens };

  if (opening && now >= opening.closes) return { state: "closed", detail: null };

  if (now < fromMinutes(DAY_START) || now >= fromMinutes(DAY_END)) return null;

  const closes = opening?.closes ?? null;
  const sorted = [...occupancy].sort((a, b) => a.inizio.localeCompare(b.inizio));

  if (sorted.some((slot) => slot.inizio <= now && slot.fine > now)) {
    // Back-to-back lessons count as one busy stretch.
    let end = now;

    for (const slot of sorted) if (slot.inizio <= end && slot.fine > end) end = slot.fine;

    if (closes && end >= closes) return { state: "busy", detail: "closesAt", time: closes };

    return { state: "busy", detail: "freeFrom", time: end };
  }

  const next = sorted.find((slot) => slot.inizio > now);

  if (next && (!closes || next.inizio < closes))
    return { state: "free", detail: "freeUntil", time: next.inizio };

  if (closes) return { state: "free", detail: "closesAt", time: closes };

  return { state: "free", detail: "freeRestOfDay" };
}

/** Drops partially free rooms unless the "partially free" filter is on. */
export function visibleResults(results: BuildingAvailability[], filters: Filters) {
  if (filters.partial) return results;

  return results.flatMap((group) => {
    const rooms = group.rooms.filter((room) => room.status === "free");

    return rooms.length ? [{ ...group, rooms }] : [];
  });
}

export function countRooms(results: BuildingAvailability[]) {
  return results.reduce((sum, group) => sum + group.rooms.length, 0);
}

export interface FilterImpact {
  key: RestrictiveFilter;
  /** How many more rooms would be listed without this filter. */
  gain: number;
}

/** For each active filter, how many rooms it hides on its own: the biggest culprit first. */
export function filterImpact(
  campusId: string,
  isoDate: string,
  from: string,
  to: string,
  filters: Filters,
): FilterImpact[] {
  const shown = countRooms(
    visibleResults(findAvailability(campusId, isoDate, from, to, filters), filters),
  );

  return RESTRICTIVE_FILTERS.filter((key) => isFilterActive(filters, key))
    .map((key) => {
      const relaxed = { ...filters, [key]: DEFAULT_FILTERS[key] };

      const total = countRooms(
        visibleResults(findAvailability(campusId, isoDate, from, to, relaxed), relaxed),
      );

      return { key, gain: total - shown };
    })
    .filter((impact) => impact.gain > 0)
    .sort((a, b) => b.gain - a.gain);
}
