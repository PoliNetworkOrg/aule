import { beforeAll, describe, expect, it, vi } from "vite-plus/test";

// The ceremonies' days are looked up per campus and day, and a campus that does
// not graduate that day must never be flagged.

let graduation: typeof import("./graduation");

beforeAll(async () => {
  vi.stubGlobal("location", { hostname: "localhost" });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("window", { addEventListener: () => undefined, localStorage });
  vi.stubGlobal("document", { documentElement: {} });

  const sessions = [
    { date: "2000-01-01", campuses: ["MIA01"] },
    { date: "2999-10-21", campuses: ["MIA01", "MIB01"] },
    { date: "2999-10-21", campuses: ["CRG02"] },
  ];

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ sessions })),
  );

  graduation = await import("./graduation");
  await graduation.loadGraduations();
});

describe("graduation days", () => {
  it("flags the campuses holding ceremonies on a day", () => {
    expect(graduation.graduationOn("2999-10-21", "MIA01")).toBe(true);
    expect(graduation.graduationOn("2999-10-21", "CRG02")).toBe(true);
  });

  it("leaves out other campuses and other days", () => {
    expect(graduation.graduationOn("2999-10-21", "LCF04")).toBe(false);
    expect(graduation.graduationOn("2999-10-22", "MIA01")).toBe(false);
  });

  it("drops days already past", () => {
    expect(graduation.graduationOn("2000-01-01", "MIA01")).toBe(false);
  });

  it("keeps the selection's order when listing the graduating campuses", () => {
    expect(graduation.graduatingCampuses("2999-10-21", ["MIB01", "LCF04", "MIA01"])).toEqual([
      "MIB01",
      "MIA01",
    ]);
  });
});
