import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import {
  buildVocab,
  editDistance,
  expandToken,
  scoreMatch,
  tokenize,
  type VocabWord,
} from "./search-matching";
import type { Campus, OccupancyDay } from "./types";

const VOCAB = buildVocab([
  "Analisi matematica 1",
  "Università degli studi",
  "Rossi Mario",
  "Rossa Russi",
  "Possibile",
  "Fisica tecnica",
]);

function expand(query: string, vocab: VocabWord[] = VOCAB) {
  const words = tokenize(query);

  return words.map((word, index) => expandToken(word, index === words.length - 1, vocab));
}

function corrections(query: string) {
  return expand(query).flatMap((token) => token.variants.slice(1).map((v) => v.text));
}

describe("editDistance", () => {
  it("counts a swap of adjacent letters as one edit", () => {
    expect(editDistance("anlaisi", "analisi", 2)).toBe(1);
  });

  it("gives up past the allowed edits", () => {
    expect(editDistance("fisica", "analisi", 2)).toBe(Infinity);
  });

  it("measures against the closest prefix for a half-typed word", () => {
    expect(editDistance("matme", "matematica", 1, true)).toBe(1);
  });
});

describe("expandToken", () => {
  it("corrects typos", () => {
    expect(corrections("anlaisi")).toContain("analisi");
    expect(corrections("fisika")).toContain("fisica");
  });

  it("treats a missing accent as an exact match", () => {
    expect(expand("universita")[0].variants).toContainEqual({ text: "università", typos: 0 });
  });

  it("never corrects codes or room numbers", () => {
    expect(expand("61183", buildVocab(["61182"]))[0].variants).toEqual([
      { text: "61183", typos: 0 },
    ]);
  });

  it("also tries a code without its leading zeros", () => {
    expect(expand("061182")[0].variants.map((v) => v.text)).toEqual(["061182", "61182"]);
  });

  it("leaves a word alone when it exists as typed", () => {
    expect(corrections("rossi")).toEqual([]);
    expect(corrections("rosis")).toContain("rossi");
  });

  it("completes a half-typed last word, not an earlier one", () => {
    expect(corrections("matemat")).toEqual([]);
    expect(corrections("matenat")).toContain("matematica");
    expect(expand("matenat analisi")[0].variants).toHaveLength(1);
  });

  it("allows no typos in very short words", () => {
    expect(corrections("ab")).toEqual([]);
  });
});

describe("scoreMatch", () => {
  const score = (fields: string[], query: string, compactPrimary = false) =>
    scoreMatch(fields, expand(query), { compactPrimary });

  it("needs every token to match somewhere", () => {
    expect(score(["Analisi 1", "Rossi"], "analisi rossi")).toBeGreaterThan(0);
    expect(score(["Analisi 1", "Rossi"], "analisi bianchi")).toBe(0);
  });

  it("ranks tokens typed in the name's own order first", () => {
    expect(score(["T.2.1"], "t 2 1")).toBeGreaterThan(score(["T.1.2"], "t 2 1"));
  });

  it("ranks an exact name above a prefix, and a prefix above a word inside", () => {
    const exact = score(["Analisi"], "analisi");
    const prefix = score(["Analisi matematica"], "analisi");
    const inside = score(["Corso di analisi"], "analisi");

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(inside);
  });

  it("ranks a primary-field match above a secondary one", () => {
    expect(score(["Fisica", "Rossi"], "fisica")).toBeGreaterThan(
      score(["Chimica", "Fisica"], "fisica"),
    );
  });

  it("ranks an exact match above the same match through a typo", () => {
    expect(score(["Analisi"], "analisi")).toBeGreaterThan(score(["Analisi"], "anlaisi"));
    expect(score(["Analisi"], "anlaisi")).toBeGreaterThan(0);
  });

  it("matches a room name with its separators left out", () => {
    expect(score(["T.1.1"], "t11", true)).toBeGreaterThan(0);
    expect(score(["T.1.1"], "t11")).toBe(0);
  });
});

// ---------- the search itself ----------

vi.mock("../lib/query", () => ({ fetchJson: vi.fn(async () => DIRECTORY) }));

const DIRECTORY: Campus[] = [
  {
    id: "MIA01",
    name: "Leonardo",
    buildings: [
      {
        name: "Edificio 3",
        classrooms: [
          { id: 1, name: "T.1.2" },
          { id: 2, name: "T.2.1" },
          { id: 3, name: "T.1.1" },
        ],
      },
      { name: "Edificio 11", classrooms: [{ id: 4, name: "Aula 11.1" }] },
    ],
  },
];

function slot(course: string, professor: string, inizio: string) {
  return { inizio, fine: "10:00", category: "COURSE", course, professors: [professor] };
}

const DAY: OccupancyDay = {
  date: "20261006",
  generated_at: "2026-10-06T03:00:00",
  campuses: [
    {
      id: "MIA01",
      name: "Leonardo",
      buildings: [
        {
          name: "Edificio 3",
          classrooms: [
            {
              id: 1,
              name: "T.1.2",
              occupancy: [
                slot("Metodi di analisi numerica", "BIANCHI LUCA", "08:15"),
                slot("Analisi matematica 1", "ROSSI MARIO", "09:15"),
              ],
            },
          ],
        },
      ],
    },
  ],
};

let search: typeof import("./classroom-search-data");

beforeAll(async () => {
  vi.stubGlobal("location", { hostname: "localhost" });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("window", { addEventListener: () => undefined, localStorage });

  search = await import("./classroom-search-data");
  const occupancy = await import("./available-rooms-script");

  await search.ensureClassroomDirectory();
  occupancy.classroomsData.push(DAY);
});

describe("room search", () => {
  const names = (query: string) => search.runClassroomSearch(query).visible.map((r) => r.name);

  it("puts the room typed in order first", () => {
    expect(names("t 2 1")[0]).toBe("T.2.1");
    expect(names("t12")).toEqual(["T.1.2"]);
  });

  it("finds rooms through a typo in the building name", () => {
    expect(names("edifcio 11")).toContain("Aula 11.1");
  });
});

describe("lesson search", () => {
  const titles = (query: string) => search.runOccupationSearch(query).groups.map((g) => g.title);

  it("ranks a course named like the query above one that only contains it", () => {
    // By time alone "Metodi di analisi numerica" (08:15) would come first.
    expect(titles("analisi")).toEqual(["Analisi matematica 1", "Metodi di analisi numerica"]);
  });

  it("finds a professor through a typo and exposes the correction", () => {
    expect(titles("rosis")).toEqual(["Analisi matematica 1"]);
    expect(search.searchCorrections("rosis")).toContain("rossi");
  });
});
