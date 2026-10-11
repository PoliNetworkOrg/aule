import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { BuildingHours, Occupation } from "../types";

// Occupancy is data about bookings, not about whether the doors are open: a room
// with no lessons in a closed building must never be reported as free.

const CAMPUS = "MIA01";

const TUESDAY = "2026-10-06";

const SATURDAY = "2026-10-10";

const WEEKDAYS_ONLY: BuildingHours = { mon_fri: ["07:15", "20:15"], sat: null, sun: null };

const LATE_OPENING: BuildingHours = { mon_fri: ["08:00", "19:30"], sat: null, sun: null };

const EARLY_CLOSING: BuildingHours = { mon_fri: ["08:00", "17:00"], sat: null, sun: null };

let script: typeof import("../available-rooms-script");

let availability: typeof import("./availability");

let agenda: typeof import("./agenda");

let filters: typeof import("./store").DEFAULT_FILTERS;

beforeAll(async () => {
  vi.stubGlobal("location", { hostname: "localhost" });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("window", { addEventListener: () => undefined, localStorage });
  vi.stubGlobal("document", { documentElement: {} });

  script = await import("../available-rooms-script");
  availability = await import("./availability");
  agenda = await import("./agenda");
  filters = (await import("./store")).DEFAULT_FILTERS;
});

function lesson(inizio: string, fine: string): Occupation {
  return { inizio, fine, category: "COURSE", course: "Analisi" };
}

function seed(hours: BuildingHours | undefined, dates: string[], occupancy: Occupation[] = []) {
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
              hours,
              classrooms: [{ id: 2401, name: "24.1", occupancy }],
            },
          ],
        },
      ],
    })),
  );
}

function search(date: string, from: string, to: string) {
  return availability.findAvailability([CAMPUS], date, from, to, filters);
}

beforeEach(() => script.classroomsData.splice(0));

describe("building closed for the whole day", () => {
  beforeEach(() =>
    seed(WEEKDAYS_ONLY, [TUESDAY.replaceAll("-", ""), SATURDAY.replaceAll("-", "")]),
  );

  it("still lists the room on a day the building is open", () => {
    const [group] = search(TUESDAY, "09:00", "11:00");

    expect(group.rooms.map((room) => [room.room.name, room.status])).toEqual([["24.1", "free"]]);
  });

  it("lists no room on a day the building never opens", () => {
    expect(search(SATURDAY, "09:00", "11:00")).toEqual([]);
  });

  it("reports a favourite or search hit as closed, not free", () => {
    expect(availability.roomWindowStatus(2401, SATURDAY, "09:00", "11:00")?.status).toBe("closed");
  });

  it("shows the whole agenda as closed", () => {
    expect(agenda.buildAgenda([], { closed: true })).toEqual([
      { kind: "closed", start: "07:15", end: "20:15" },
    ]);
  });
});

describe("search before the building opens", () => {
  beforeEach(() => seed(LATE_OPENING, [TUESDAY.replaceAll("-", "")]));

  it("offers only the part of the window after opening, as partly free", () => {
    const [group] = search(TUESDAY, "07:15", "09:00");
    const [room] = group.rooms;

    expect(room.status).toBe("partial");
    expect(room.slots).toEqual([{ start: "08:00", end: "09:00" }]);
    expect(room.freeMinutes).toBe(60);
  });

  it("lists nothing when the whole window is before opening", () => {
    expect(search(TUESDAY, "07:15", "07:45")).toEqual([]);
  });

  it("reports a window before opening as closed and a straddling one as partial", () => {
    expect(availability.roomWindowStatus(2401, TUESDAY, "07:15", "07:45")?.status).toBe("closed");

    const straddling = availability.roomWindowStatus(2401, TUESDAY, "07:15", "09:00");

    expect(straddling?.status).toBe("partial");
    expect(straddling?.slots).toEqual([{ start: "08:00", end: "09:00" }]);
  });

  it("marks the time before opening as closed in the agenda", () => {
    const items = agenda.buildAgenda([lesson("09:00", "11:00")], {
      opens: "08:00",
      closes: "19:30",
    });

    expect(items.map((item) => [item.kind, item.start, item.end])).toEqual([
      ["closed", "07:15", "08:00"],
      ["free", "08:00", "09:00"],
      ["busy", "09:00", "11:00"],
      ["free", "11:00", "19:30"],
      ["closed", "19:30", "20:15"],
    ]);
  });
});

describe("window that runs past closing time", () => {
  beforeEach(() => seed(EARLY_CLOSING, [TUESDAY.replaceAll("-", "")]));

  it("cuts the free time at closing and reports the room as partly free", () => {
    const [group] = search(TUESDAY, "16:00", "18:00");
    const [room] = group.rooms;

    expect(room.status).toBe("partial");
    expect(room.slots).toEqual([{ start: "16:00", end: "17:00" }]);
    expect(room.freeMinutes).toBe(60);
  });

  it("does not report a window fully inside opening hours as partial", () => {
    const [group] = search(TUESDAY, "09:00", "10:00");

    expect(group.rooms[0].status).toBe("free");
  });

  it("lists nothing when the whole window is after closing", () => {
    expect(search(TUESDAY, "17:30", "19:00")).toEqual([]);
    expect(availability.roomWindowStatus(2401, TUESDAY, "17:30", "19:00")?.status).toBe("closed");
  });

  it("keeps a booked lesson visible and closes the rest of the evening", () => {
    const items = agenda.buildAgenda([lesson("16:00", "17:00")], {
      opens: "08:00",
      closes: "17:00",
    });

    expect(items.map((item) => item.kind)).toEqual(["closed", "free", "busy", "closed"]);
  });
});

describe("opening hours unavailable", () => {
  beforeEach(() => seed(undefined, [TUESDAY.replaceAll("-", "")]));

  it("falls back to the occupancy alone, on purpose, instead of hiding every room", () => {
    const [group] = search(TUESDAY, "07:15", "09:00");

    expect(group.rooms[0].status).toBe("free");
    expect(availability.roomWindowStatus(2401, TUESDAY, "07:15", "09:00")?.status).toBe("free");
    expect(agenda.buildAgenda([], null).map((item) => item.kind)).toEqual(["free"]);
  });
});

describe("a room's state right now", () => {
  const now = (time: string, date = TUESDAY) => availability.roomNowStatus(2401, date, time);

  beforeEach(() =>
    seed(
      EARLY_CLOSING,
      [TUESDAY.replaceAll("-", ""), SATURDAY.replaceAll("-", "")],
      [lesson("09:00", "11:00"), lesson("16:00", "17:00")],
    ),
  );

  it("is closed all day when the building never opens", () => {
    expect(now("10:00", SATURDAY)).toEqual({ state: "closed", detail: "closedToday" });
  });

  it("is closed, with the opening time, before opening", () => {
    expect(now("07:30")).toEqual({ state: "closed", detail: "opensAt", time: "08:00" });
  });

  it("is closed after closing", () => {
    expect(now("17:00")).toEqual({ state: "closed", detail: null });
  });

  it("says when a busy room frees up, unless the building closes first", () => {
    expect(now("10:00")).toEqual({ state: "busy", detail: "freeFrom", time: "11:00" });
    expect(now("16:30")).toEqual({ state: "busy", detail: "closesAt", time: "17:00" });
  });

  it("caps a free room at the next lesson or at closing", () => {
    expect(now("12:00")).toEqual({ state: "free", detail: "freeUntil", time: "16:00" });
    expect(now("08:15")).toEqual({ state: "free", detail: "freeUntil", time: "09:00" });
  });
});

describe("a booked lesson inside closed time", () => {
  it("stays visible in the agenda", () => {
    const items = agenda.buildAgenda([lesson("07:15", "08:30")], {
      opens: "08:00",
      closes: "17:00",
    });

    expect(items.map((item) => [item.kind, item.start, item.end])).toEqual([
      ["busy", "07:15", "08:30"],
      ["free", "08:30", "17:00"],
      ["closed", "17:00", "20:15"],
    ]);
  });
});

describe("how long a free room stays free", () => {
  function until(hours: BuildingHours, occupancy: Occupation[], from: string, to: string) {
    seed(hours, [TUESDAY.replaceAll("-", "")], occupancy);

    return search(TUESDAY, from, to)[0]?.rooms[0]?.freeUntil;
  }

  it("runs to the next lesson after the window", () => {
    expect(
      until(WEEKDAYS_ONLY, [lesson("08:00", "09:00"), lesson("13:15", "15:00")], "10:00", "12:00"),
    ).toBe("13:15");
  });

  it("stops at the window's end when a lesson starts right then", () => {
    expect(until(WEEKDAYS_ONLY, [lesson("12:00", "13:00")], "10:00", "12:00")).toBe("12:00");
  });

  it("stops at closing when no lesson comes first", () => {
    expect(until(EARLY_CLOSING, [lesson("18:00", "19:00")], "10:00", "12:00")).toBe("17:00");
  });

  it("runs to the end of the day otherwise", () => {
    expect(until(WEEKDAYS_ONLY, [], "10:00", "12:00")).toBe("20:15");
  });

  it("is left out for partly free rooms", () => {
    expect(until(WEEKDAYS_ONLY, [lesson("11:00", "11:30")], "10:00", "12:00")).toBeUndefined();
  });
});
