import type {
  AvailableClassroom,
  Building,
  OccupancyDay,
  OpeningHours,
  Occupation,
  Classroom,
} from "./types";
import { fetchJson } from "../lib/query";
import { getApiBase } from "./config.ts";

// Occupancy data (both the "HH:MM" slot boundaries and the YYYYMMDD day keys)
// is expressed in Europe/Rome wall-clock time. Reading a Date's *local*
// getters instead (as the browser sees them) silently computes classroom
// status/date-of-day against the wrong "now" for any visitor whose device
// isn't in that timezone.
const romeHHMMFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/Rome",
});

const romeDatePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/Rome",
});

function formatRomeHHMM(date: Date) {
  return romeHHMMFormatter.format(date);
}

function formatRomeYYYYMMDD(date: Date) {
  // en-CA formats as YYYY-MM-DD; strip the dashes to match the API's key shape.
  return romeDatePartsFormatter.format(date).replace(/-/g, "");
}

const romeDateTimePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/Rome",
});

// Returns a Date whose *local* wall-clock components (getHours/getDate/
// setDate/getDay/...) represent "now" in Europe/Rome, regardless of the
// browser's own timezone. Its underlying instant/epoch value is meaningless
// (it isn't the real UTC moment "now" would give) — only use it via local
// getters/setters, the same way date-picker-state.ts builds local-only Date
// objects to represent calendar dates.
export function getRomeNow() {
  const parts = romeDateTimePartsFormatter.formatToParts(new Date());

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
}

// ---------- DATA ----------

// Data fetched from the API will be stored here,
// one entry per day inside the array, starting with 0 = today.
export const classroomsData: OccupancyDay[] = [];

// Day of the week to skip. If one of the next 7 days is a
// day listed here, skip to the next day.
// This mirrors what happens in the backend.
export const SKIP_DAYS = [0]; // Sunday

// ----------  FETCHING LOGIC ----------

// Extracts the identifier used to key openingHours.buildings/campus_defaults
// from a building's name (e.g. "32.1" -> "32", "B12" -> "B12", "16B" -> "16B").
const BUILDING_ID_RE = /^([a-z]*\d+[a-z]?)/i;

// Mirrors scripts/fetch.py's _building_hours_key(), so both sides resolve
// the same building to the same opening-hours.json entry.
function buildingHoursKey(building: Building) {
  const match = BUILDING_ID_RE.exec(String(building.name ?? ""));

  return (match ? match[1] : String(building.name ?? "")).toUpperCase();
}

// Resolves a building's opening hours: explicit match > campus default > global default.
// Mirrors scripts/fetch.py's resolve_building_hours().
function resolveBuildingHours(building: Building, campusId: string, openingHours: OpeningHours) {
  const key = buildingHoursKey(building);

  if (openingHours.buildings[key]) return openingHours.buildings[key];

  if (openingHours.campus_defaults[campusId]) return openingHours.campus_defaults[campusId];

  return openingHours.default_hours;
}

// Fetches the classrooms data from the server and
// stores it in classroomsData.
export async function fetchClassroomsData() {
  try {
    const apiBase = getApiBase();
    const { dates } = await fetchJson<{ dates: string[] }>(`${apiBase}/v1/occupations`);

    const [results, openingHours] = await Promise.all([
      Promise.allSettled(
        dates.map((date) => {
          const isoDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;

          return fetchJson<OccupancyDay>(`${apiBase}/v1/occupations/${isoDate}`);
        }),
      ).then((settled) => settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))),
      fetchJson<OpeningHours>(`${apiBase}/v1/opening-hours`).catch((error) => {
        // Non-fatal: fall through with openingHours = null so classroomsData
        // still loads (and gets used) even if opening hours can't be fetched.
        console.error("Error fetching opening hours data:", error);

        return null;
      }),
    ]);

    if (openingHours) {
      for (const day of results) {
        for (const campus of day.campuses) {
          for (const building of campus.buildings) {
            building.hours = resolveBuildingHours(building, campus.id, openingHours);
          }
        }
      }
    }

    if (results.length === 0 && dates.length > 0) {
      // Every per-date fetch failed even though the dates list itself
      // loaded fine — keep whatever (stale but real) data is already in
      // classroomsData instead of wiping it out to an empty array, which
      // would otherwise turn a transient per-date outage into "no data at
      // all" for anyone reloading the page.
      console.error("All per-date occupancy fetches failed; keeping previous data.");
    } else {
      classroomsData.splice(0, classroomsData.length, ...results);
    }

    console.log("All data loaded:", classroomsData);
  } catch (error) {
    console.error("Error fetching classrooms data:", error);
  }
}

// ---------- LOGIC ----------

// Returns a list of available classrooms for the
// given campus, date and time range.
// The query is perfomed on the data previously fetched and
// stored in classroomsData.
//
// Classrooms are returned together with a start and end time,
// which represent the time range in which the classroom is available.
// This allows to define 'partial availability', which is
// useful to return relevant data,
// especially when full availability is not possible.
export function findAvailableClassrooms(
  campusId: string,
  date: string,
  fromTime: string,
  toTime: string,
) {
  const formattedDate = dateKeyFromISODate(date);

  // Find the day's data
  const dayData = classroomsData.find((day) => day.date === formattedDate);

  if (!dayData) {
    console.warn(`No data found for date ${formattedDate}`);

    return [];
  }

  // Find the campus
  const campusData = dayData.campuses.find((c) => c.id === campusId);

  if (!campusData) {
    console.warn(`No data found for campus ${campusId} on date ${date}`);

    return [];
  }

  const results = [];

  for (const building of campusData.buildings) {
    const availableRooms: AvailableClassroom[] = [];

    for (const classroom of building.classrooms) {
      const freeSlots = getFreeSlots(classroom.occupancy, fromTime, toTime);

      if (freeSlots.length > 0) {
        const isFree =
          freeSlots.length === 1 && freeSlots[0].start === fromTime && freeSlots[0].end === toTime;

        availableRooms.push({
          id: classroom.id,
          name: classroom.name,
          status: isFree ? "free" : "partially-free",
          features: classroom.features ?? [],
          occupancy: classroom.occupancy ?? [],
          slots: freeSlots,
          idfoto: classroom.idfoto ?? null,
        });
      }
    }

    const STATUS_ORDER = { free: 0, "partially-free": 1, "not-free": 2 };
    availableRooms.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

    if (availableRooms.length > 0) {
      results.push({
        building: building,
        rooms: availableRooms,
      });
    }
  }

  return results;
}

// ---------- HELPERS ----------

// Converts a "YYYY-MM-DD" date-picker value straight into the API's YYYYMMDD
// key via string manipulation, deliberately avoiding a Date round-trip:
// `new Date("YYYY-MM-DD")` parses as UTC midnight, so reading it back with
// local getters (as formatDateYYYYMMDD does) silently shifts the date by a
// day for any viewer behind UTC. Use this for date-only strings; keep
// formatDateYYYYMMDD for real Date instances.
function dateKeyFromISODate(isoDate: string) {
  return isoDate.replace(/-/g, "");
}

// Returns the free time slots within [fromTime, toTime]
// given an array of occupancy slots from the JSON.
function getFreeSlots(occupancy: Occupation[], fromTime: string, toTime: string) {
  const freeSlots = [];
  let cursor = fromTime;

  // Sort occupancy just in case it isn't already
  const sorted = [...occupancy]
    .map((s) => ({ start: s.inizio, end: s.fine }))
    .sort((a, b) => a.start.localeCompare(b.start));

  for (const slot of sorted) {
    if (slot.end <= cursor) continue; // slot entirely before our window

    if (slot.start >= toTime) break; // slot entirely after our window

    if (slot.start > cursor) {
      // free gap before this occupied slot
      freeSlots.push({ start: cursor, end: slot.start });
    }

    cursor = slot.end > cursor ? slot.end : cursor;
  }

  // free gap after the last occupied slot
  if (cursor < toTime) {
    freeSlots.push({ start: cursor, end: toTime });
  }

  return freeSlots;
}

/**
 * Given a classroom's occupancy slots and a reference instant (Date), returns
 * the availability status relative to that instant.
 * Possible return values: 'free', 'occupied', 'free-soon', 'occupied-soon'.
 */
export function computeClassroomStatus(occupancy: Occupation[] | null | undefined, refDate: Date) {
  const slots = occupancy ?? [];
  // Occupancy slot times ("09:15", etc.) are Europe/Rome wall-clock time, so
  // refDate must be read in that timezone rather than the browser's local
  // one — otherwise a visitor abroad (or a UTC-configured device) sees
  // classroom status computed against the wrong "now".
  const currentTime = formatRomeHHMM(refDate);
  const isOccupiedNow = slots.some((slot) => currentTime >= slot.inizio && currentTime < slot.fine);

  const thirtyMinsLater = new Date(refDate.getTime() + 30 * 60 * 1000);
  const thirtyMinsLaterTime = formatRomeHHMM(thirtyMinsLater);

  if (isOccupiedNow) {
    // Check if it will be free within 30 mins
    const currentSlot = slots.find((slot) => currentTime >= slot.inizio && currentTime < slot.fine);

    // If current slot ends within 30 mins AND no other slot starts before that 30 min window ends
    if (currentSlot!.fine < thirtyMinsLaterTime) {
      const nextOccupancy = slots.some(
        (slot) => slot.inizio >= currentSlot!.fine && slot.inizio < thirtyMinsLaterTime,
      );

      if (!nextOccupancy) {
        return "free-soon";
      }
    }

    return "occupied";
  } else {
    // Currently free. Check if it will be occupied within 30 mins.
    const nextOccupancy = slots.some(
      (slot) => slot.inizio > currentTime && slot.inizio < thirtyMinsLaterTime,
    );

    if (nextOccupancy) {
      return "occupied-soon";
    }

    return "free";
  }
}

/**
 * Returns the current availability status of a classroom relative to NOW.
 * Possible return values: 'free', 'occupied', 'free-soon', 'occupied-soon', or null if no data.
 */
export function getClassroomStatusNow(classroomId: number | string) {
  if (!classroomsData || classroomsData.length === 0) return null;

  const now = new Date();
  const dateKey = formatRomeYYYYMMDD(now);

  // Find today's data
  const dayData = classroomsData.find((day) => day.date === dateKey);

  if (!dayData) return null;

  let classroom: Classroom | undefined;

  outer: for (const campus of dayData.campuses) {
    for (const building of campus.buildings) {
      classroom = building.classrooms.find((r) => String(r.id) === String(classroomId));

      if (classroom) break outer;
    }
  }

  if (!classroom) return null;

  return computeClassroomStatus(classroom.occupancy ?? [], now);
}

/**
 * Builds the data for the "zoom out" building overview: every building in the
 * given campus on the given date, each with a per-status classroom count.
 *
 * The status is computed over the queried [fromTime, toTime] window, using
 * the same free-slot logic as findAvailableClassrooms(), so the counts match
 * what the classrooms grid below is showing for that same query (free /
 * partially-free / occupied) instead of a snapshot at a single instant.
 *
 * Returns [{ building, counts: {free, 'partially-free', occupied} }]
 * in the campus's building order.
 */
export function getCampusBuildingsOverview(
  campusId: string,
  date: string,
  fromTime: string,
  toTime: string,
) {
  const formattedDate = dateKeyFromISODate(date);
  const dayData = classroomsData.find((day) => day.date === formattedDate);

  if (!dayData) return [];

  const campusData = dayData.campuses.find((c) => c.id === campusId);

  if (!campusData) return [];

  return campusData.buildings.map((building) => {
    const counts = { free: 0, "partially-free": 0, occupied: 0 };

    for (const room of building.classrooms ?? []) {
      const freeSlots = getFreeSlots(room.occupancy ?? [], fromTime, toTime);

      if (freeSlots.length === 0) {
        counts.occupied++;
      } else {
        const isFullyFree =
          freeSlots.length === 1 && freeSlots[0].start === fromTime && freeSlots[0].end === toTime;

        counts[isFullyFree ? "free" : "partially-free"]++;
      }
    }

    return { building, counts };
  });
}
