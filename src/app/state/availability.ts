import { classroomsData as occupancyDays, SKIP_DAYS } from "../available-rooms-script";
import { classroomsData as directory } from "../classroom-search-data";
import type { Building, Campus, Classroom, Occupation } from "../types";
import type { Filters } from "./store";
import { dateKeyToIso, isoToDateKey, parseIsoDate, romeTodayIso, toMinutes } from "./time";

export type WindowStatus = "free" | "partial" | "occupied";

export interface FreeSlot {
  start: string;
  end: string;
}

export interface RoomAvailability {
  room: Classroom;
  building: Building;
  status: WindowStatus;
  /** Free intervals inside the searched window. */
  slots: FreeSlot[];
  /** Total free minutes inside the searched window. */
  freeMinutes: number;
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

/** The occupancy slots of one room on one ISO date, or null when that day has no data. */
export function roomOccupancy(roomId: number, isoDate: string): Occupation[] | null {
  const day = occupancyDays.find((entry) => entry.date === isoToDateKey(isoDate));

  if (!day) return null;

  for (const campus of day.campuses)
    for (const building of campus.buildings)
      for (const room of building.classrooms) if (room.id === roomId) return room.occupancy ?? [];

  return [];
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

export function windowStatus(slots: FreeSlot[], from: string, to: string): WindowStatus {
  if (!slots.length) return "occupied";

  return slots.length === 1 && slots[0].start === from && slots[0].end === to ? "free" : "partial";
}

function slotMinutes(slots: FreeSlot[]) {
  return slots.reduce((sum, slot) => sum + toMinutes(slot.end) - toMinutes(slot.start), 0);
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
 * Rooms of a campus that are free for at least part of [from, to] on `isoDate`,
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

    const rooms: RoomAvailability[] = [];

    for (const occupied of building.classrooms) {
      const entry = entryIndex?.get(occupied.id);
      const room = entry?.room ?? occupied;

      if (!matchesFilters(room, filters)) continue;

      const slots = freeSlots(occupied.occupancy ?? [], from, to);
      const status = windowStatus(slots, from, to);

      if (status === "occupied" || (status === "partial" && filters.fullyFree)) continue;

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
  const occupancy = roomOccupancy(roomId, isoDate);

  if (!occupancy) return null;

  const slots = freeSlots(occupancy, from, to);

  return { status: windowStatus(slots, from, to), slots };
}
