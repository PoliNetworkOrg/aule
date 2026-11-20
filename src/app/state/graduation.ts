import { fetchJson } from "../../lib/query";
import { getApiBase } from "../config.ts";
import { readState, setState, useStore } from "./store";
import { romeTodayIso } from "./time";

// Graduation days (sessioni di laurea), from /v1/graduation-sessions (scraped
// monthly by scripts/fetch_graduation_sessions.py). The ceremonies use classrooms
// that the occupancy data still lists as free, so on those days a campus's rooms
// may be taken whatever the schedule says.

interface GraduationSession {
  /** ISO date, "YYYY-MM-DD". */
  date: string;
  /** Ids of the campuses holding a ceremony that day. */
  campuses: string[];
}

/** Campus ids graduating, by ISO date. Days already past are left out. */
let days = new Map<string, Set<string>>();

let loaded = false;

function indexSessions(sessions: GraduationSession[], today: string) {
  const index = new Map<string, Set<string>>();

  for (const session of sessions) {
    if (session.date < today) continue;

    const campuses = index.get(session.date) ?? new Set<string>();

    for (const id of session.campuses) campuses.add(id);

    index.set(session.date, campuses);
  }

  return index;
}

/**
 * Fetches the sessions once. Non-fatal: without them no day is marked, which is
 * the same as before the feature. A failure may be retried by calling it again.
 */
export async function loadGraduations() {
  if (loaded) return;

  try {
    const { sessions } = await fetchJson<{ sessions: GraduationSession[] }>(
      `${getApiBase()}/v1/graduation-sessions`,
    );

    days = indexSessions(sessions, romeTodayIso());
    loaded = true;
    setState({ graduationRevision: readState().graduationRevision + 1 });
  } catch (error) {
    console.error("Error fetching graduation sessions:", error);
  }
}

/** Whether `campusId` holds graduation ceremonies on the ISO date `date`. */
export function graduationOn(date: string, campusId: string) {
  return days.get(date)?.has(campusId) ?? false;
}

/** The ones of `campusIds` holding graduation ceremonies on `date`, in the same order. */
export function graduatingCampuses(date: string, campusIds: string[]) {
  return campusIds.filter((id) => graduationOn(date, id));
}

/** Re-renders the caller once the sessions have loaded. */
export function useGraduations() {
  useStore((state) => state.graduationRevision);
}
