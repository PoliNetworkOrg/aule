import { selectCampusById } from "./campus-picker.tsx";

export const PREFERRED_CAMPUS_ENABLED_KEY = "poliAule_preferredCampusEnabled";

export const PREFERRED_CAMPUS_ID_KEY = "poliAule_preferredCampusId";

export const REMEMBER_LAST_CAMPUS_KEY = "poliAule_rememberLastCampus";

export const LAST_CAMPUS_ID_KEY = "poliAule_lastCampusId";

export const HIDE_SUNDAYS_KEY = "poliAule_hideSundays";

export const SHOW_PARTIAL_KEY = "poliAule_showPartial";

export const INTERVAL_HOURS_KEY = "poliAule_intervalHours";

export const DEFAULT_TAB_KEY = "poliAule_defaultTab";

export const LAST_TAB_KEY = "poliAule_lastTab";

export const AUTO_SEARCH_KEY = "poliAule_autoSearch";

export const LIVE_SEARCH_KEY = "poliAule_liveSearch";

// Returns the tab container ID to show on startup
export function getStartupTabId() {
  const mode = localStorage.getItem(DEFAULT_TAB_KEY) ?? "available";

  if (mode === "last") {
    return localStorage.getItem(LAST_TAB_KEY) ?? "available-classrooms-container";
  }

  if (mode === "search") return "search-classrooms-container";

  return "available-classrooms-container";
}

// ── Startup campus restorers ──────────────────────────────────────────────────

// Called from script.js after setupCampusPicker() to apply the saved preferred campus.
export function applyPreferredCampusIfEnabled() {
  if (localStorage.getItem(PREFERRED_CAMPUS_ENABLED_KEY) !== "true") return;
  const id = localStorage.getItem(PREFERRED_CAMPUS_ID_KEY);

  if (id) selectCampusById(id);
}

// Called from script.js after setupCampusPicker() to restore the last used campus.
export function applyRememberLastCampusIfEnabled() {
  if (localStorage.getItem(REMEMBER_LAST_CAMPUS_KEY) !== "true") return;
  const id = localStorage.getItem(LAST_CAMPUS_ID_KEY);

  if (id) selectCampusById(id);
}
