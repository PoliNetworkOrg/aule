import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { BuildingHours, Occupation } from "../types";

// An occupancy of `null` means no source had the room's schedule that day
// (scripts/fetch.py). It is unknown, not free: a room with no bookings and a
// room nobody knows about must never look the same.

const CAMPUS = "MIA01";

const TUESDAY = "2026-10-06";

const SATURDAY = "2026-10-10";

const WEEKDAYS_ONLY: BuildingHours = { mon_fri: ["08:00", "20:00"], sat: null, sun: null };

let script: typeof import("../available-rooms-script");

let availability: typeof import("./availability");

let filters: typeof import("./store").DEFAULT_FILTERS;

beforeAll(async () => {
  vi.stubGlobal("location", { hostname: "localhost" });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("window", { addEventListener: () => undefined, localStorage });
  vi.stubGlobal("document", { documentElement: {} });

  script = await import("../available-rooms-script");
  availability = await import("./availability");
  filters = (await import("./store")).DEFAULT_FILTERS;
});

/** One building with a known room (2401) and one whose schedule is unknown (2402). */
function seed(dates: string[], known: Occupation[] = []) {
  script.classroomsData.splice(
    0,
    script.classroomsData.length,
    ...dates.map((date) => ({
      date: date.replaceAll("-", ""),
      generated_at: "2026-10-05T03:00:00",
      campuses: [
        {
          id: CAMPUS,
          name: "Milano Leonardo",
          buildings: [
            {
              name: "24",
              hours: WEEKDAYS_ONLY,
              classrooms: [
                { id: 2401, name: "24.1", occupancy: known },
                { id: 2402, name: "24.2", occupancy: null },
              ],
            },
          ],
        },
      ],
    })),
  );
}

beforeEach(() => seed([TUESDAY, SATURDAY]));

describe("a room whose schedule is unknown", () => {
  it("is never listed as free", () => {
    const [group] = availability.findAvailability(CAMPUS, TUESDAY, "09:00", "11:00", filters);

    expect(group.rooms.map((room) => room.room.name)).toEqual(["24.1"]);
  });

  it("is not counted among the building's bookable rooms", () => {
    const [group] = availability.findAvailability(CAMPUS, TUESDAY, "09:00", "11:00", filters);

    expect(group.total).toBe(1);
  });

  it("reports unknown to favourites and search hits while the building is open", () => {
    expect(availability.roomWindowStatus(2402, TUESDAY, "09:00", "11:00")).toEqual({
      status: "unknown",
      slots: [],
    });
  });

  it("still reports closed when the building is shut anyway", () => {
    expect(availability.roomWindowStatus(2402, SATURDAY, "09:00", "11:00")?.status).toBe("closed");
  });

  it("has no current state while open, but keeps the building's closures", () => {
    expect(availability.roomNowStatus(2402, TUESDAY, "10:00")).toBeNull();
    expect(availability.roomNowStatus(2402, TUESDAY, "07:30")).toEqual({
      state: "closed",
      detail: "opensAt",
      time: "08:00",
    });
    expect(availability.roomNowStatus(2402, SATURDAY, "10:00")).toEqual({
      state: "closed",
      detail: "closedToday",
    });
  });

  it("hands the schedule a null occupancy, not an empty day", () => {
    expect(availability.roomDay(2402, TUESDAY)?.occupancy).toBeNull();
    expect(availability.roomDay(2401, TUESDAY)?.occupancy).toEqual([]);
  });
});

describe("a room missing from the day's data", () => {
  it("is unknown that day, not free", () => {
    expect(availability.roomDay(9999, TUESDAY)?.occupancy).toBeNull();
    expect(availability.roomWindowStatus(9999, TUESDAY, "09:00", "11:00")?.status).toBe("unknown");
  });
});
