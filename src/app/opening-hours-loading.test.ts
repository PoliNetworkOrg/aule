import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { OccupancyDay, OpeningHours } from "./types";

const MONDAY = "2026-10-05";

const HOURS: OpeningHours = {
  buildings: { "32": { mon_fri: ["08:00", "19:30"], sat: null, sun: null } },
  campus_defaults: { MIA01: { mon_fri: ["07:30", "20:30"], sat: null, sun: null } },
  default_hours: { mon_fri: ["07:15", "20:15"], sat: null, sun: null },
  holiday_periods: [{ start: "2026-10-05", end: "2026-10-06" }],
};

function day(date: string): OccupancyDay {
  const room = { id: 1, name: "x", occupancy: [] };

  return {
    date,
    generated_at: "2026-10-05T03:00:00",
    campuses: [
      {
        id: "MIA01",
        name: "Leonardo",
        buildings: [
          { name: "32.1", classrooms: [room] },
          { name: "24", classrooms: [room] },
        ],
      },
      { id: "LC01", name: "Lecco", buildings: [{ name: "L1", classrooms: [room] }] },
    ],
  };
}

type Payload = OccupancyDay | OpeningHours | { dates: string[] };

function api(date: string, hours?: OpeningHours) {
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;

  const responses = new Map<string, Payload>([
    ["/v1/occupations", { dates: [date] }],
    [`/v1/occupations/${iso}`, day(date)],
  ]);

  if (hours) responses.set("/v1/opening-hours", hours);

  return responses;
}

function stubApi(responses: Map<string, Payload>) {
  vi.stubGlobal("location", { hostname: "localhost" });
  vi.stubGlobal("localStorage", { getItem: () => "false", setItem: () => undefined });

  vi.stubGlobal("fetch", async (url: string) => {
    const path = url.replace(/^https:\/\/[^/]+/, "");

    const payload = responses.get(path);

    return payload
      ? { ok: true, status: 200, json: async () => payload }
      : { ok: false, status: 500, json: async () => ({}) };
  });
}

async function freshScript() {
  vi.resetModules();

  return import("./available-rooms-script");
}

beforeEach(() => vi.unstubAllGlobals());

describe("resolving building hours", () => {
  it("prefers the building, then the campus default, then the global default", async () => {
    stubApi(api("20261007", HOURS));

    const script = await freshScript();

    await script.fetchClassroomsData();

    const [mia, lecco] = script.classroomsData[0].campuses;

    expect(mia.buildings.map((building) => building.hours?.mon_fri?.[0])).toEqual([
      "08:00",
      "07:30",
    ]);
    expect(lecco.buildings[0].hours?.mon_fri).toEqual(["07:15", "20:15"]);
    expect(script.hasOpeningHours()).toBe(true);
  });

  it("closes every building on a holiday period, whatever its weekly hours", async () => {
    stubApi(api("20261005", HOURS));

    const script = await freshScript();
    const availability = await import("./state/availability");

    await script.fetchClassroomsData();

    const [building] = script.classroomsData[0].campuses[0].buildings;

    expect(availability.buildingOpening(building, MONDAY)).toEqual({ closed: true });
    expect(availability.buildingOpening(building, "2026-10-07")).toEqual({
      opens: "08:00",
      closes: "19:30",
    });
  });
});

describe("opening hours that fail to load", () => {
  it("keeps the occupancy usable and reports the hours as unavailable", async () => {
    stubApi(api("20261007"));

    const script = await freshScript();

    await script.fetchClassroomsData();

    expect(script.classroomsData).toHaveLength(1);
    expect(script.classroomsData[0].campuses[0].buildings[0].hours).toBeUndefined();
    expect(script.hasOpeningHours()).toBe(false);
  });

  it("keeps applying the last known hours to freshly loaded days", async () => {
    const responses = api("20261007", HOURS);

    stubApi(responses);

    const script = await freshScript();

    await script.fetchClassroomsData();
    responses.delete("/v1/opening-hours");
    responses.set("/v1/occupations/2026-10-07", day("20261007"));
    await script.fetchClassroomsData();

    expect(script.hasOpeningHours()).toBe(true);
    expect(script.classroomsData[0].campuses[0].buildings[0].hours?.mon_fri?.[0]).toBe("08:00");
  });
});
