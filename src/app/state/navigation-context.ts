import { closePage, goBack, openPage } from "../../lib/navigation";
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

/** Opens an in-app page so that its back link can return with history.back(). */
export function openInApp(path: string) {
  openedFromApp = true;
  openPage(path);
}

/** Leaves the current page: back through history when we came from the app, else home. */
export function leavePage() {
  if (openedFromApp) goBack();
  else closePage();
}
