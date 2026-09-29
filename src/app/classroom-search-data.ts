import type { Campus, Classroom } from "./types";

export interface SearchRoom extends Classroom {
  buildingName: string;
  buildingAltName?: string;
  campusName: string;
}

export interface OccupationSession {
  date: string;
  inizio: string;
  fine: string;
  roomId: number;
  roomName: string;
  buildingName: string;
  buildingAltName?: string;
  campusName: string;
}

export interface OccupationGroup {
  title: string;
  code: number | string | null;
  section: string | null;
  professors: string[];
  isExam: boolean;
  sessions: OccupationSession[];
  sessionCount?: number;
}

interface OccupationRow extends OccupationSession {
  category: string | null;
  isExam: boolean;
  title: string;
  code: number | string | null;
  section: string | null;
  professors: string[];
  haystack: string;
}

import { fetchJson } from "../lib/query";
import { classroomsData as occupancyDays } from "./available-rooms-script.ts";
import { getApiBase } from "./config.ts";
import {
  buildVocab,
  expandToken,
  scoreMatch,
  tokenize,
  type ExpandedToken,
  type VocabWord,
} from "./search-matching.ts";

export { compactName, ROOM_NAME_SEPARATORS, tokenize } from "./search-matching.ts";

// Static classroom directory (campus → buildings → classrooms) plus the text /
// occupation search that runs against it. The search UI lives in
// home/search-results.tsx; this module owns the data and the indexes.

export let classroomsData: Campus[] | null = null;

let searchIndex: SearchRoom[] | null = null;

export const SEARCH_MAX_RESULTS = 40;

// ---------- DATA ----------

async function loadData() {
  if (classroomsData) return;
  classroomsData = await fetchJson<Campus[]>(`${getApiBase()}/v1/classrooms`, Infinity);
}

// Loads the static classroom directory. Blocks the splash: the campus switcher,
// classroom pages and favourites are built from it.
export async function ensureClassroomDirectory() {
  await loadData();
}

const numericCollator = new Intl.Collator(undefined, { numeric: true });

interface RoomSearchResult {
  visible: SearchRoom[];
  total: number;
  capped: boolean;
}

let lastRoomSearch: { query: string; vocab: VocabWord[]; result: RoomSearchResult } | null = null;

/** Rooms matching `query` by room, building or campus name, best match first. */
export function runClassroomSearch(query: string): RoomSearchResult {
  if (!classroomsData) return { visible: [], total: 0, capped: false };

  if (!searchIndex) searchIndex = buildSearchIndex();

  const tokens = expandQuery(query);

  if (lastRoomSearch?.query === query && lastRoomSearch.vocab === vocab)
    return lastRoomSearch.result;

  const results = searchIndex
    .map((room) => ({
      room,
      score: scoreMatch(
        [room.name, room.buildingName, room.buildingAltName, room.campusName],
        tokens,
        { compactPrimary: true },
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || numericCollator.compare(a.room.name, b.room.name))
    .map(({ room }) => room);

  const capped = results.length > SEARCH_MAX_RESULTS;

  const result = {
    visible: capped ? results.slice(0, SEARCH_MAX_RESULTS) : results,
    total: results.length,
    capped,
  };

  lastRoomSearch = { query, vocab, result };

  return result;
}

function buildSearchIndex() {
  const index: SearchRoom[] = [];

  for (const campus of classroomsData!) {
    for (const building of campus.buildings) {
      for (const room of building.classrooms) {
        index.push({
          ...room,
          buildingName: building.name,
          buildingAltName: building.altName,
          campusName: campus.name,
        });
      }
    }
  }

  return index;
}

// ---------- OCCUPATION (lesson / exam) SEARCH ----------
//
// Searches the loaded occupancy data (available-rooms-script.ts, up to 7 days)
// for slots whose course name, code, section, professors, or raw string match
// the query. Identical events (same course/code/professors, recurring across
// days and rooms) are folded into one group with a list of sessions.

export const OCC_MAX_GROUPS = 24;

const OCC_MAX_SESSIONS = 6;

let occIndex: OccupationRow[] | null = null;

let occIndexDayCount = -1;

// Occupancy JSON stores the day as "YYYYMMDD"; normalise to ISO so Date() and
// Intl can parse it.
function isoDate(d: string) {
  const s = String(d ?? "");

  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}

function buildOccupationIndex() {
  const rows: OccupationRow[] = [];

  for (const day of occupancyDays) {
    const date = isoDate(day.date);

    for (const campus of day.campuses ?? []) {
      for (const building of campus.buildings ?? []) {
        for (const room of building.classrooms ?? []) {
          for (const slot of room.occupancy ?? []) {
            if (!slot.inizio || !slot.fine) continue;
            const professors = Array.isArray(slot.professors) ? slot.professors : [];
            const title = slot.course ?? slot.raw ?? slot.name ?? "";
            rows.push({
              date,
              inizio: slot.inizio,
              fine: slot.fine,
              category: slot.category ?? null,
              isExam: slot.category === "EXAM",
              title,
              code: slot.code ?? null,
              section: slot.section ?? null,
              professors,
              roomId: room.id,
              roomName: room.name,
              buildingName: building.name,
              buildingAltName: building.altName,
              campusName: campus.name,
              haystack: [
                title,
                slot.code != null ? String(slot.code) : "",
                slot.section ?? "",
                professors.join(" "),
                slot.raw ?? "",
                slot.name ?? "",
              ]
                .join("  ")
                .toLowerCase(),
            });
          }
        }
      }
    }
  }

  return rows;
}

function ensureOccIndex() {
  if (!occIndex || occIndexDayCount !== occupancyDays.length) {
    occIndex = buildOccupationIndex();
    occIndexDayCount = occupancyDays.length;
  }
}

// ---------- QUERY EXPANSION ----------
//
// The vocabulary typo corrections are drawn from: every word in the directory
// and in the loaded lessons. Rebuilt along with the occupation index.

let vocab: VocabWord[] = [];

let vocabSources: { directory: Campus[] | null; occupations: OccupationRow[] | null } | null = null;

let expansions = new Map<string, ExpandedToken[]>();

function ensureVocab() {
  ensureOccIndex();

  if (vocabSources?.directory === classroomsData && vocabSources.occupations === occIndex)
    return vocab;

  const texts: (string | undefined)[] = [];

  for (const campus of classroomsData ?? []) {
    texts.push(campus.name);

    for (const building of campus.buildings) {
      texts.push(building.name, building.altName);

      for (const room of building.classrooms) texts.push(room.name);
    }
  }

  for (const row of occIndex ?? []) texts.push(row.haystack);

  vocab = buildVocab(texts);
  vocabSources = { directory: classroomsData, occupations: occIndex };
  expansions = new Map();

  return vocab;
}

/** The query's tokens, each with the words it may be a typo of. */
export function expandQuery(query: string): ExpandedToken[] {
  const words = tokenize(query);
  const vocabulary = ensureVocab();
  const key = words.join(" ");
  let tokens = expansions.get(key);

  if (!tokens) {
    tokens = words.map((word, index) => expandToken(word, index === words.length - 1, vocabulary));
    expansions.set(key, tokens);
  }

  return tokens;
}

/** Words the query matches only through a correction, for highlighting them in the results. */
export function searchCorrections(query: string): string[] {
  const words = expandQuery(query).flatMap((token) => token.variants.slice(1));

  return [...new Set(words.map((variant) => variant.text))];
}

function rowMatchesToken(row: OccupationRow, token: ExpandedToken): boolean {
  return token.variants.some((variant) => row.haystack.includes(variant.text));
}

interface OccupationSearchResult {
  groups: OccupationGroup[];
  total: number;
  capped: boolean;
  maxSessions: number;
}

let lastOccupationSearch: {
  query: string;
  index: OccupationRow[] | null;
  result: OccupationSearchResult;
} | null = null;

/**
 * Finds occupation rows matching every token of `query`, in any order, grouped
 * by course/section, best match first.
 */
export function runOccupationSearch(query: string): OccupationSearchResult {
  const tokens = expandQuery(query);

  if (lastOccupationSearch?.query === query && lastOccupationSearch.index === occIndex)
    return lastOccupationSearch.result;

  const result = searchOccupations(tokens);

  lastOccupationSearch = { query, index: occIndex, result };

  return result;
}

function searchOccupations(tokens: ExpandedToken[]): OccupationSearchResult {
  if (!tokens.length || occIndex!.length === 0)
    return { groups: [], total: 0, capped: false, maxSessions: OCC_MAX_SESSIONS };

  const matched = occIndex!.filter((r) => tokens.every((tok) => rowMatchesToken(r, tok)));

  const groups = new Map<string, OccupationGroup>();

  for (const r of matched) {
    const key = [r.category, r.code, r.title, r.section, r.professors.join(",")]
      .join("|")
      .toLowerCase();

    let g = groups.get(key);

    if (!g) {
      g = {
        title: r.title,
        code: r.code,
        section: r.section,
        professors: r.professors,
        isExam: r.isExam,
        sessions: [],
      };
      groups.set(key, g);
    }

    g.sessions.push({
      date: r.date,
      inizio: r.inizio,
      fine: r.fine,
      roomId: r.roomId,
      roomName: r.roomName,
      buildingName: r.buildingName,
      buildingAltName: r.buildingAltName,
      campusName: r.campusName,
    });
  }

  const list = [...groups.values()];

  const scores = new Map<OccupationGroup, number>();

  for (const g of list) {
    g.sessions.sort((a, b) => (a.date + a.inizio).localeCompare(b.date + b.inizio));
    g.sessionCount = g.sessions.length;

    // A row can also match on its raw booking text, which none of these
    // fields carry: still a match, just the weakest.
    const score = scoreMatch(
      [g.title, g.code != null ? String(g.code) : "", g.section, g.professors.join(" ")],
      tokens,
    );

    scores.set(g, Math.max(1, score));
  }

  list.sort(
    (a, b) =>
      scores.get(b)! - scores.get(a)! ||
      (a.sessions[0].date + a.sessions[0].inizio).localeCompare(
        b.sessions[0].date + b.sessions[0].inizio,
      ),
  );

  const capped = list.length > OCC_MAX_GROUPS;

  return {
    groups: capped ? list.slice(0, OCC_MAX_GROUPS) : list,
    total: list.length,
    capped,
    maxSessions: OCC_MAX_SESSIONS,
  };
}
