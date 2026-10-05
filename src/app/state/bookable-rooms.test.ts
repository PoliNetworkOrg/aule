import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { BuildingHours, Campus, OccupancyDay, Occupation } from "../types";

// The directory flags what isn't a place to study: `secondary` campuses and
// buildings (nothing to book) and `eventsOnly` rooms (generally closed outside
// official events). The occupation files don't repeat those flags, so the
// free-room search has to read them from the directory.

const CAMPUS = "MIA01";

const TUESDAY = "2026-10-06";

const SATURDAY = "2026-10-10";

const WEEKDAYS_ONLY: BuildingHours = { mon_fri: ["08:00", "20:00"], sat: null, sun: null };

const EVERY_DAY: BuildingHours = {
  mon_fri: ["08:00", "20:00"],
  sat: ["08:00", "20:00"],
  sun: null,
};

let script: typeof import("../available-rooms-script");

let search: typeof import("../classroom-search-data");

let availability: typeof import("./availability");

let filters: typeof import("./store").DEFAULT_FILTERS;

beforeAll(async () => {
  vi.stubGlobal("location", { hostname: "localhost" });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("window", { addEventListener: () => undefined, localStorage });
  vi.stubGlobal("document", { documentElement: {} });

  script = await import("../available-rooms-script");
  search = await import("../classroom-search-data");
  availability = await import("./availability");
  filters = (await import("./store")).DEFAULT_FILTERS;
});

function lesson(inizio: string, fine: string): Occupation {
  return { inizio, fine, category: "COURSE", course: "Analisi" };
}

const DIRECTORY: Campus[] = [
  {
    id: CAMPUS,
    name: "Milano Leonardo",
    slug: "leonardo",
    buildings: [
      {
        name: "24",
        classrooms: [
          { id: 2401, name: "24.1" },
          { id: 2402, name: "Aula Magna", eventsOnly: true },
        ],
      },
      // Secondary with a room in it: only events-only rooms, as in the real data.
      { name: "1", secondary: true, classrooms: [{ id: 101, name: "Aula Rogers" }] },
      // Secondary with no rooms at all: offices, open on Saturdays.
      { name: "OFF", secondary: true, classrooms: [] },
    ],
  },
  {
    id: "MIC",
    name: "Residenze",
    secondary: true,
    buildings: [{ name: "R1", secondary: true, classrooms: [] }],
  },
];

/** The occupation file for `date`: same rooms, no flags, as scripts/fetch.py writes them. */
function day(date: string, aulaMagna: Occupation[] = []): OccupancyDay {
  return {
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
              { id: 2401, name: "24.1", occupancy: [] },
              { id: 2402, name: "Aula Magna", occupancy: aulaMagna },
            ],
          },
          {
            name: "1",
            hours: WEEKDAYS_ONLY,
            classrooms: [{ id: 101, name: "Aula Rogers", occupancy: [] }],
          },
          { name: "OFF", hours: EVERY_DAY, classrooms: [] },
        ],
      },
      {
        id: "MIC",
        name: "Residenze",
        buildings: [{ name: "R1", hours: EVERY_DAY, classrooms: [] }],
      },
    ],
  };
}

beforeAll(() => search.setClassroomDirectory(DIRECTORY));

beforeEach(() => {
  script.classroomsData.splice(
    0,
    script.classroomsData.length,
    day(TUESDAY, [lesson("10:00", "12:00")]),
    day(SATURDAY),
  );
});

describe("free-room search", () => {
  it("offers neither events-only rooms nor rooms in secondary buildings", () => {
    const results = availability.findAvailability(CAMPUS, TUESDAY, "08:00", "09:00", filters);

    expect(results.map((group) => group.building.name)).toEqual(["24"]);
    expect(results[0].rooms.map((room) => room.room.name)).toEqual(["24.1"]);
    expect(results[0].total).toBe(1);
  });

  it("leaves secondary campuses out of the campus picker", () => {
    expect(availability.campuses().map((campus) => campus.id)).toEqual([CAMPUS]);
    expect(availability.findCampus("MIC")).toBeNull();
  });
});

describe("closures", () => {
  it("ignore secondary buildings, whatever their hours", () => {
    expect(availability.campusClosed(CAMPUS, SATURDAY, "09:00", "11:00")).toBe(true);
    expect([...availability.closedBuildings(CAMPUS, SATURDAY, "09:00", "11:00")]).toEqual(["24"]);
  });
});

describe("an events-only room", () => {
  it("is usually closed for favourites and search hits, even with no event booked", () => {
    expect(availability.roomWindowStatus(2402, TUESDAY, "08:00", "09:00")?.status).toBe(
      "eventsOnly",
    );
    expect(availability.roomWindowStatus(101, TUESDAY, "08:00", "09:00")?.status).toBe(
      "eventsOnly",
    );
  });

  it("is still closed when its building is", () => {
    expect(availability.roomWindowStatus(2402, SATURDAY, "08:00", "09:00")?.status).toBe("closed");
  });

  it("is busy during an event, until it ends, and has no state otherwise", () => {
    expect(availability.roomNowStatus(2402, TUESDAY, "11:00")).toEqual({
      state: "busy",
      detail: "busyUntil",
      time: "12:00",
    });
    expect(availability.roomNowStatus(2402, TUESDAY, "13:00")).toBeNull();
  });

  it("is told apart from a regular room", () => {
    const magna = availability.findClassroom(2402);
    const regular = availability.findClassroom(2401);
    const rogers = availability.findClassroom(101);

    expect(magna && availability.isUsuallyClosed(magna)).toBe(true);
    expect(rogers && availability.isUsuallyClosed(rogers)).toBe(true);
    expect(regular && availability.isUsuallyClosed(regular)).toBe(false);
  });
});
