import type { Building, HolidayPeriod, OccupancyDay, OpeningHours } from "./types";
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

export function formatRomeHHMM(date: Date) {
  return romeHHMMFormatter.format(date);
}

// Exported because anything comparing against the API's day keys (which are
// Rome calendar days) has to derive its own "which day is it" the same way —
// see the data-freshness indicator in application.tsx.
export function formatRomeYYYYMMDD(date: Date) {
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

// Minutes since midnight in Europe/Rome. Timeline axes (07:15–20:15), "now"
// markers and after-hours day roll-over all plot against Rome wall-clock
// data, so they must not read the browser's local clock — otherwise a
// visitor abroad sees the marker at the wrong position (or off the axis
// entirely) and lands on the wrong day.
export function romeMinutesOfDay() {
  const now = getRomeNow();

  return now.getHours() * 60 + now.getMinutes();
}

// ---------- DATA ----------

// Data fetched from the API will be stored here,
// one entry per day inside the array, starting with 0 = today.
export const classroomsData: OccupancyDay[] = [];

// The last opening hours that loaded. Holiday closures apply to every building
// at once, so they live here rather than on building.hours; kept between
// reloads so a failed refresh doesn't make every building look open again.
let lastOpeningHours: OpeningHours | null = null;

let holidayPeriods: HolidayPeriod[] = [];

/** False until /v1/opening-hours has loaded once: closures are then unknown, not absent. */
export function hasOpeningHours() {
  return lastOpeningHours !== null;
}

export function getHolidayPeriods() {
  return holidayPeriods;
}

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

// Stamps every building of `days` with its resolved hours and remembers the
// holiday periods.
export function applyOpeningHours(days: OccupancyDay[], openingHours: OpeningHours) {
  lastOpeningHours = openingHours;
  holidayPeriods = openingHours.holiday_periods ?? [];

  for (const day of days)
    for (const campus of day.campuses)
      for (const building of campus.buildings)
        building.hours = resolveBuildingHours(building, campus.id, openingHours);
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

    // A failed refresh keeps the hours we already had; only a first-ever failure
    // leaves buildings without hours (see hasOpeningHours).
    const knownHours = openingHours ?? lastOpeningHours;

    if (knownHours) applyOpeningHours(results, knownHours);

    // Merge per date rather than replacing the array wholesale: a partial
    // outage (some per-date fetches rejected, others fine) would otherwise
    // drop the still-valid data we already hold for the failed dates,
    // turning a transient blip into missing days in the UI. Keep the
    // requested order from `dates`, preferring a fresh response and falling
    // back to the previous entry for that date.
    const fetched = new Map(results.map((day) => [day.date, day]));
    const previous = new Map(classroomsData.map((day) => [day.date, day]));

    const merged = dates.flatMap((date) => {
      const day = fetched.get(date) ?? previous.get(date);

      return day ? [day] : [];
    });

    if (results.length < dates.length) {
      console.error(
        `${dates.length - results.length} of ${dates.length} per-date occupancy fetches failed; keeping previous data for those dates.`,
      );
    }

    classroomsData.splice(0, classroomsData.length, ...merged);

    console.log("All data loaded:", classroomsData);
  } catch (error) {
    console.error("Error fetching classrooms data:", error);
  }
}
