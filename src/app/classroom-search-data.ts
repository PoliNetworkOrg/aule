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

// Static classroom directory (campus → buildings → classrooms) plus the text /
// occupation search that runs against it. The search UI itself lives in the
// search overlay (components/search-overlay.js); this module owns the data, the
// indexes, and the result-card builders it drives.

export let classroomsData: Campus[] | null = null;

let searchIndex: SearchRoom[] | null = null;

export const SEARCH_MAX_RESULTS = 40;

// ---------- DATA ----------

async function loadData() {
  if (classroomsData) return;
  classroomsData = await fetchJson<Campus[]>(`${getApiBase()}/v1/classrooms`, Infinity);
}

// Loads the static classroom directory. Blocks the splash — it's what the page
// shell (campus picker, classroom detail, favourites) is built from.
export async function ensureClassroomDirectory() {
  await loadData();
}

// `ensureSearchData()` is idempotent and safe to call before the search overlay
// has been opened for the first time.
export async function ensureSearchData() {
  await loadData();

  if (!searchIndex) searchIndex = buildSearchIndex();
}

export function runClassroomSearch(query: string) {
  if (!classroomsData) return { visible: [], total: 0, capped: false };

  if (!searchIndex) searchIndex = buildSearchIndex();
  const q = query.trim().toLowerCase();
  const qDotted = q.replace(/\s+/g, ".");

  const results = searchIndex.filter(
    (room) =>
      room.name.toLowerCase().includes(q) ||
      room.name.toLowerCase().includes(qDotted) ||
      room.buildingName.toLowerCase().includes(q) ||
      (room.buildingAltName && room.buildingAltName.toLowerCase().includes(q)) ||
      room.campusName.toLowerCase().includes(q),
  );

  const capped = results.length > SEARCH_MAX_RESULTS;

  return {
    visible: capped ? results.slice(0, SEARCH_MAX_RESULTS) : results,
    total: results.length,
    capped,
  };
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

export function hasOccupationData() {
  return occupancyDays.length > 0;
}

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

/**
 * Splits a query into lowercase words, order-independent — "rossi analisi"
 * and "analisi rossi" tokenize the same.
 */
export function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Whether a single search token matches a row, also trying the token with
 * leading zeros stripped (codes are stored as ints, so a leading zero the
 * user typed — "061182" — is gone from the haystack, "61182").
 */
function rowMatchesToken(row: OccupationRow, token: string): boolean {
  if (row.haystack.includes(token)) return true;

  const alt = token.replace(/^0+/, "");

  return alt !== "" && alt !== token && row.haystack.includes(alt);
}

/** Finds occupation rows matching every token of `query`, in any order, grouped by course/section. */
export function runOccupationSearch(query: string) {
  ensureOccIndex();
  const tokens = tokenize(query);

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

  for (const g of list) {
    g.sessions.sort((a, b) => (a.date + a.inizio).localeCompare(b.date + b.inizio));
    g.sessionCount = g.sessions.length;
  }

  list.sort((a, b) =>
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
