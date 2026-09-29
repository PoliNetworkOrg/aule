import { openPage } from "../../lib/navigation";
import { classroomPath, type ClassroomEntry } from "./availability";

// What the user was looking at when they opened a classroom: the day and
// window from the home screen, and (from search) the one session they picked.
// The classroom page opens on that day and marks them in its schedule.
export interface ClassroomContext {
  date: string;
  from: string;
  to: string;
  /** A specific session to highlight, when the page was opened from a search result. */
  highlight: boolean;
}

let pending: ClassroomContext | null = null;

let openedFromApp = false;

export function openClassroom(entry: ClassroomEntry, context: ClassroomContext | null) {
  pending = context;
  openedFromApp = true;
  openPage(classroomPath(entry));
}

/** Returns the context for the page being opened, once. */
export function takeClassroomContext() {
  const context = pending;

  pending = null;

  return context;
}

/** Whether the current page was reached from inside the app, so "back" can use history. */
export function cameFromApp() {
  return openedFromApp;
}

export function markExternalEntry() {
  openedFromApp = false;
}
