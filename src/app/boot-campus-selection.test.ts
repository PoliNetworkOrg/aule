import { beforeAll, describe, expect, it, vi } from "vite-plus/test";

const storage = new Map<string, string>();

vi.mock("./available-rooms-script", () => ({
  classroomsData: [],
  fetchClassroomsData: vi.fn().mockResolvedValue(undefined),
  getRomeNow: () => new Date(2026, 9, 6, 12, 0),
  getHolidayPeriods: () => [],
  hasOpeningHours: () => false,
  SKIP_DAYS: [0],
}));

vi.mock("./classroom-search-data", () => ({
  classroomsData: [
    {
      id: "MIA01",
      name: "Leonardo",
      buildings: [{ name: "3", classrooms: [] }],
    },
  ],
  ensureClassroomDirectory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./i18n", () => ({ initI18n: vi.fn().mockResolvedValue(undefined) }));

beforeAll(() => {
  vi.stubGlobal("location", { hostname: "localhost" });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("window", {
    clearTimeout: () => undefined,
    setTimeout: () => 0,
    localStorage,
  });
  vi.stubGlobal("document", { getElementById: () => null });
});

describe("campus selection boot validation", () => {
  it("persists the valid selection after dropping obsolete saved campuses", async () => {
    storage.set("poliAule_campusIds", JSON.stringify(["removed", "MIA01"]));
    storage.set("poliAule_lastCampusId", "removed");

    const { startApplication } = await import("./boot");
    const { readState } = await import("./state/store");

    await startApplication();

    expect(readState().campusIds).toEqual(["MIA01"]);
    expect(storage.get("poliAule_campusIds")).toBe(JSON.stringify(["MIA01"]));
    expect(storage.get("poliAule_lastCampusId")).toBe("MIA01");
  });
});
