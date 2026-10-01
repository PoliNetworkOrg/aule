import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { BuildingHours, Occupation } from "../types";

// Several campuses are searched together. Leonardo and Lecco both have a
// building "8", so buildings are told apart by campus as well as by name.

const LEONARDO = "MIA01";

const LECCO = "LCF04";

const TUESDAY = "2026-10-06";

const OPEN: BuildingHours = { mon_fri: ["07:15", "20:15"], sat: null, sun: null };

const CLOSED: BuildingHours = { mon_fri: null, sat: null, sun: null };

const storage = new Map<string, string>();

let script: typeof import("../available-rooms-script");

let availability: typeof import("./availability");

let store: typeof import("./store");

beforeAll(async () => {
  vi.stubGlobal("location", { hostname: "localhost" });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("window", { addEventListener: () => undefined, localStorage });
  vi.stubGlobal("document", { documentElement: {} });

  script = await import("../available-rooms-script");
  availability = await import("./availability");
  store = await import("./store");
});

function lesson(inizio: string, fine: string): Occupation {
  return { inizio, fine, category: "COURSE", course: "Analisi" };
}

function building(name: string, roomId: number, hours = OPEN, occupancy: Occupation[] = []) {
  return { name, hours, classrooms: [{ id: roomId, name: `${name}.1`, seats: 50, occupancy }] };
}

function seed(leccoHours = OPEN, leonardoHours = OPEN) {
  script.classroomsData.splice(0, script.classroomsData.length, {
    date: TUESDAY.replaceAll("-", ""),
    generated_at: "2026-10-05T03:00:00",
    campuses: [
      {
        id: LEONARDO,
        name: "Leonardo",
        buildings: [
          building("3", 301, leonardoHours),
          building("8", 801, leonardoHours, [lesson("09:00", "10:00")]),
        ],
      },
      { id: LECCO, name: "Lecco", buildings: [building("8", 8801, leccoHours)] },
    ],
  });
}

function search(campusIds: string[], building = "") {
  return availability.findAvailability(campusIds, TUESDAY, "09:00", "11:00", {
    ...store.DEFAULT_FILTERS,
    partial: true,
    building,
  });
}

beforeEach(() => {
  storage.clear();
  seed();
});

describe("searching several campuses", () => {
  it("lists every campus in the order given, each building under its own key", () => {
    expect(search([LEONARDO, LECCO]).map((group) => [group.key, group.campus.name])).toEqual([
      ["MIA01/3", "Leonardo"],
      ["MIA01/8", "Leonardo"],
      ["LCF04/8", "Lecco"],
    ]);
  });

  it("keeps the rooms of same-named buildings apart", () => {
    const rooms = search([LEONARDO, LECCO]).map((group) => [
      group.key,
      group.rooms.map((room) => [room.room.id, room.status]),
    ]);

    expect(rooms).toContainEqual(["MIA01/8", [[801, "partial"]]]);
    expect(rooms).toContainEqual(["LCF04/8", [[8801, "free"]]]);
  });

  it("filters on one campus's building, not every building with that name", () => {
    expect(search([LEONARDO, LECCO], "LCF04/8").map((group) => group.key)).toEqual(["LCF04/8"]);
  });

  it("skips a campus with no data that day", () => {
    expect(search(["MNG01", LECCO]).map((group) => group.key)).toEqual(["LCF04/8"]);
  });
});

describe("closed buildings across campuses", () => {
  it("names closed buildings by campus", () => {
    seed(CLOSED);

    expect([...availability.closedBuildings([LEONARDO, LECCO], TUESDAY, "09:00", "11:00")]).toEqual(
      ["LCF04/8"],
    );
  });

  it("is all closed only when every campus is", () => {
    seed(CLOSED);
    expect(availability.campusClosed([LEONARDO, LECCO], TUESDAY, "09:00", "11:00")).toBe(false);
    expect(availability.campusClosed([LECCO], TUESDAY, "09:00", "11:00")).toBe(true);

    seed(CLOSED, CLOSED);
    expect(availability.campusClosed([LEONARDO, LECCO], TUESDAY, "09:00", "11:00")).toBe(true);
  });

  it("does not call every campus closed when one selected campus has no data", () => {
    seed(OPEN, CLOSED);
    script.classroomsData[0].campuses.splice(1, 1);

    expect(availability.campusClosed([LEONARDO, LECCO], TUESDAY, "09:00", "11:00")).toBe(false);
  });
});

describe("filter hints across campuses", () => {
  it("counts the rooms a filter hides on every selected campus", () => {
    const filters = { ...store.DEFAULT_FILTERS, partial: true, minSeats: 100 as const };

    expect(
      availability.filterImpact([LEONARDO, LECCO], TUESDAY, "09:00", "11:00", filters),
    ).toEqual([{ key: "minSeats", gain: 3 }]);
  });
});

describe("campus selection", () => {
  const order = [LEONARDO, "MIA06", LECCO];

  it("keeps the directory order whatever the order of the clicks", () => {
    expect(store.toggledCampuses([LECCO], [LEONARDO], true, order)).toEqual([LEONARDO, LECCO]);
  });

  it("never empties the selection", () => {
    expect(store.toggledCampuses([LECCO], [LECCO], false, order)).toEqual([LECCO]);
    expect(store.toggledCampuses([LEONARDO, "MIA06"], [LEONARDO, "MIA06"], false, order)).toEqual([
      LEONARDO,
      "MIA06",
    ]);
  });

  it("selects or clears a whole area", () => {
    expect(store.toggledCampuses([LECCO], [LEONARDO, "MIA06"], true, order)).toEqual(order);
    expect(store.toggledCampuses(order, [LEONARDO, "MIA06"], false, order)).toEqual([LECCO]);
  });

  it("keeps a filtered building only while its campus stays selected", () => {
    store.setState({ campusIds: [LEONARDO, LECCO], mapBuilding: "LCF04/8" });
    store.setFilters({ building: "MIA01/8" });

    store.setCampuses([LEONARDO]);
    expect(store.readState().filters.building).toBe("MIA01/8");
    expect(store.readState().mapBuilding).toBeNull();

    store.setCampuses([LECCO]);
    expect(store.readState().filters.building).toBe("");
  });

  it("remembers the selection, and the first campus for older versions", () => {
    store.setState({ campusIds: [LEONARDO] });
    store.setCampuses([LEONARDO, LECCO]);

    expect(storage.get("poliAule_campusIds")).toBe(JSON.stringify([LEONARDO, LECCO]));
    expect(storage.get("poliAule_lastCampusId")).toBe(LEONARDO);
    expect(store.readInitialCampuses()).toEqual([LEONARDO, LECCO]);
  });

  it("starts from the last single campus of older versions", () => {
    storage.set("poliAule_lastCampusId", LECCO);
    expect(store.readInitialCampuses()).toEqual([LECCO]);

    storage.set("poliAule_campusIds", "not json");
    expect(store.readInitialCampuses()).toEqual([LECCO]);

    storage.set("poliAule_campusIds", "[]");
    expect(store.readInitialCampuses()).toEqual([LECCO]);
  });
});
