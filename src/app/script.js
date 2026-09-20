import { initPopovers } from "./components/popover.ts";

history.scrollRestoration = "manual";

window.scrollTo(0, 0);

const h = location.hostname;

const envLabel =
  h === "beta.poliaule.com"
    ? "Beta"
    : h === "dev.poliaule.com"
      ? "Dev"
      : h === "poliaule.com"
        ? null
        : "Local";

if (envLabel) {
  const badge = document.getElementById("env-badge");
  badge.textContent = envLabel;
  badge.removeAttribute("hidden");
}

import {
  classroomsData,
  findAvailableClassrooms,
  fetchClassroomsData,
  SKIP_DAYS,
} from "./available-rooms-script.ts";

import {
  ensureClassroomDirectory,
  classroomsData as staticClassroomsData,
} from "./classroom-search-data.ts";
import { classroomDetail } from "./components/classroom-detail.js";
import { infoPage } from "./components/info-page.js";

import { initTimeControls } from "./components/time-controls-state.ts";
import { setupCampusPicker } from "./components/campus-picker.tsx";
import { initCampusMap } from "./components/campus-map.tsx";
import { initCampusSheet } from "./components/campus-sheet.tsx";
import { retranslateCampusBuildingsPage } from "./components/campus-buildings.tsx";
import { setupDatePicker } from "./components/date-picker.tsx";
import { initPickerDock } from "./components/picker-dock.ts";
import { renderDataFetchStatus, setDataFetchReloading } from "./components/data-fetch-card";

import { haptics, defaultPatterns } from "./components/haptics.ts";
import { renderAvailableClassroomsResults } from "./components/available-results";
import { initLiquidGlass } from "./components/liquid-glass.ts";
import { initFavourites, renderFavourites } from "./components/favourites.tsx";

import { initI18n, applyTranslations, onLanguageSwitch } from "./i18n.ts";
import {
  initSettings,
  applyPreferredCampusIfEnabled,
  applyRememberLastCampusIfEnabled,
  INTERVAL_HOURS_KEY,
  AUTO_SEARCH_KEY,
  LIVE_SEARCH_KEY,
} from "./components/settings.tsx";
import {
  resolveBlurCapability,
  applyBlurState,
  scheduleIdleBenchmark,
} from "./utils/blur-capability.ts";

// ---------- SPLASH SCREEN ----------
const _splashStartTime = Date.now();

const _SPLASH_MIN_MS = 300;

// Set once showSplashError() has replaced the splash's markup with the error
// screen. The 15s init-timeout (below) and a genuinely slow-but-successful
// init are two independent setTimeout callbacks racing each other — nothing
// cancels the success path just because the timeout fired first. If init
// finishes after the error screen is already showing, dismissSplash() would
// otherwise reach for a .splash-logo/.header-logo hand-off that no longer
// applies (the error markup has no .splash-logo) and crash. Recover instead
// by just dropping the error screen and revealing the app.
let _splashFailed = false;

function dismissSplash() {
  const overlay = document.getElementById("splash-overlay");

  if (!overlay) return;

  const revealHeader = () =>
    document
      .querySelectorAll(".splash-header-item")
      .forEach((el) => el.classList.add("splash-revealed"));

  if (_splashFailed) {
    overlay.remove();
    revealHeader();

    return;
  }

  const splashLogo = overlay.querySelector(".splash-logo");
  const realLogo = document.querySelector(".header-logo");
  const isInfo = location.hash === "#info";

  if (document.startViewTransition) {
    // --- View Transition path ---
    splashLogo.style.viewTransitionName = "splash-icon";

    if (isInfo) {
      // Also name the header title/badge so they morph directly into the hero
      const titleEl = document.querySelector(".header-title");
      const badgeEl = document.getElementById("env-badge");

      if (titleEl) titleEl.style.viewTransitionName = "info-title";

      if (badgeEl && !badgeEl.hidden) {
        badgeEl.style.lineHeight = "1";
        badgeEl.style.viewTransitionName = "info-badge";
      }

      const vt = document.startViewTransition(() => {
        splashLogo.style.viewTransitionName = "";

        if (titleEl) titleEl.style.viewTransitionName = "";

        if (badgeEl) {
          badgeEl.style.lineHeight = "";
          badgeEl.style.viewTransitionName = "";
        }

        overlay.remove();
        revealHeader();

        // Open info page in this same VT — no second transition needed
        infoPage._applyOpenState("splash-icon");
      });

      // A second VT firing before this one settles rejects .ready/.finished with
      // InvalidStateError; .finished is handled above, but .ready isn't awaited
      // anywhere, so it was surfacing as an unhandled rejection on every abort.
      vt.ready.catch(() => {});
      vt.finished.then(() => infoPage._clearVtNames()).catch(() => infoPage._clearVtNames());
    } else {
      const vt = document.startViewTransition(() => {
        splashLogo.style.viewTransitionName = "";
        overlay.remove();
        revealHeader();
        realLogo.style.viewTransitionName = "splash-icon";
      });

      vt.ready.catch(() => {});

      const cleanup = () => {
        realLogo.style.viewTransitionName = "";
      };

      vt.finished.then(cleanup).catch(cleanup);
    }
  } else {
    // --- FLIP fallback ---
    const firstRect = splashLogo.getBoundingClientRect();
    const lastRect = realLogo.getBoundingClientRect();
    const dx = lastRect.left + lastRect.width / 2 - (firstRect.left + firstRect.width / 2);
    const dy = lastRect.top + lastRect.height / 2 - (firstRect.top + firstRect.height / 2);
    const scale = lastRect.height / firstRect.height;

    realLogo.style.opacity = "0";
    overlay.style.pointerEvents = "none";

    splashLogo.classList.add("splash-logo-flying");
    void splashLogo.offsetWidth;

    splashLogo.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    overlay.classList.add("splash-hiding");
    revealHeader();

    splashLogo.addEventListener(
      "transitionend",
      () => {
        realLogo.style.opacity = "";
        overlay.remove();

        if (isInfo) infoPage.openRoute();
      },
      { once: true },
    );
  }
}

function showSplashError() {
  const overlay = document.getElementById("splash-overlay");

  if (!overlay) return;
  _splashFailed = true;
  overlay.classList.add("splash-error");
  overlay.innerHTML = `
    <i class="hgi-stroke hgi-wifi-off-01 splash-error-icon" aria-hidden="true"></i>
    <p class="splash-error-title">Unable to load</p>
    <p class="splash-error-subtitle">Check your connection and try again.</p>
    <button class="button-primary splash-error-reload" onclick="location.reload()">Reload</button>
  `;
}

// ---------- THEME COLOR META TAGS ----------
const lightMeta = document.querySelector(
  'meta[name="theme-color"][media="(prefers-color-scheme: light)"]',
);

const darkMeta = document.querySelector(
  'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]',
);

const mq = window.matchMedia("(prefers-color-scheme: dark)");

function updateThemeColor(e) {
  // Force Safari to re-read by briefly swapping content
  if (e.matches) {
    darkMeta.content = "#1E1E1E";
  } else {
    lightMeta.content = "#ECECEC";
  }
}

mq.addEventListener("change", updateThemeColor);

function initializeLayout() {
  const isSamsungBrowser = /SamsungBrowser/i.test(navigator.userAgent);

  if (isSamsungBrowser) {
    document.documentElement.classList.add("samsung");
  }

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (!isSafari) {
    document.documentElement.classList.add("no-safari");
  }

  const header = document.querySelector(".header");

  const setHeaderHeight = () =>
    document.documentElement.style.setProperty("--header-height", `${header.offsetHeight}px`);

  setHeaderHeight();
  new ResizeObserver(setHeaderHeight).observe(header);

  // Live height of the sticky picker bar (mobile), so the results' sticky
  // per-building headers can park directly beneath it instead of overlapping.
  const pickerBar = document.getElementById("available-classrooms-form");

  if (pickerBar) {
    const setPickerBarHeight = () =>
      document.documentElement.style.setProperty(
        "--picker-bar-height",
        `${pickerBar.offsetHeight}px`,
      );

    setPickerBarHeight();
    new ResizeObserver(setPickerBarHeight).observe(pickerBar);
  }
}

document.querySelectorAll(".button-primary").forEach((btn) => {
  btn.addEventListener("touchend", () => {}, { passive: true });
});

// ---------- TAB BAR ----------
// Tab switching is owned by components/bottom-nav.js (the bottom pill nav).

// ---------- DATA FETCHING ----------

// Triggers the fetching of data as soon as the page loads
export async function startApplication() {
  initializeLayout();
  initPopovers();
  // Safety net: if init hangs for any reason (e.g. fonts.ready stalls on bad
  // connectivity), surface the error screen instead of staying stuck forever.
  const _initTimeoutId = setTimeout(showSplashError, 15000);

  // Kick off occupancy fetching immediately, in parallel with everything
  // below. It's an independent network round trip (locale JSON and the
  // classroom directory don't feed into it) and doesn't block the splash —
  // the date picker/results area stay in their skeleton/loading state until
  // it resolves — so there's no reason to make it wait its turn behind the
  // rest of init.
  initOccupancyData();

  try {
    // The locale JSON and the static classroom directory are independent
    // fetches (neither's data feeds the other) but both block the splash —
    // it's what the page shell (campus picker, classroom detail, favourites)
    // is built from, and translations need to be in before anything renders
    // text. Running them head-to-tail with two `await`s would serialize two
    // network round trips for no reason, so fire them together instead.
    await Promise.all([initI18n(), ensureClassroomDirectory()]);

    applyTranslations();
    // <date-chip-picker> renders its date label via Intl at module-eval time,
    // before initI18n() resolves — re-render it now that the locale is known.
    document.querySelector("date-chip-picker")?.retranslate();
    document.querySelector("time-range-chip-picker")?.retranslate();

    initSettings();

    // Init info page overlay immediately — no data dependency
    infoPage.init();

    // Search overlay (bottom-nav FAB) — lazy-loads its data on first open

    // Init classroom detail overlay (hash routing + VT morph)
    classroomDetail.init(staticClassroomsData);

    // Delegated press / swipe-deform for every .liquid-glass control
    initLiquidGlass();

    // Favourites carousel on the Available page
    initFavourites(staticClassroomsData);

    // Campus tab — fullscreen map, lazily initialised on first activation
    initCampusMap();

    // Campus tab — draggable glass sheet floating over the map
    initCampusSheet();

    // Setup the campus picker with the available ones
    setupCampusPicker(staticClassroomsData);
    applyPreferredCampusIfEnabled();
    applyRememberLastCampusIfEnabled();

    // Setup the time pickers to ensure valid time ranges
    // (these don't depend on occupancy data)
    setupTimePickers();
    initTimeControls();

    // Decide pill vs. inline-expanded pickers based on the form column's width
    // (desktop two-column layout only).
    initPickerDock();

    // Setup the language switch handler immediately — doesn't depend on
    // fonts and shouldn't wait for the splash to dismiss
    onLanguageSwitch(() => {
      setupDataFetchIndicatorText(true);
      setupDatePicker(() => preferInitialDate);
      document.querySelector("campus-chip-picker")?.retranslate();
      retranslateCampusBuildingsPage();
      renderFavourites();
      const container = document.getElementById("available-classrooms-results");

      if (!container.classList.contains("empty")) {
        document
          .getElementById("available-classrooms-form")
          .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }
    });

    // Apply the cached blur verdict (or the safe "off" default if none yet)
    // instantly — the actual benchmark never runs during load, see
    // utils/blur-capability.ts for why.
    applyBlurState(resolveBlurCapability());

    await document.fonts.ready;
    document.querySelector(".time-pickers-container").style.opacity = "1";
    document.querySelector("campus-chip-picker")?.removeAttribute("data-loading");

    clearTimeout(_initTimeoutId);
    const elapsed = Date.now() - _splashStartTime;
    const remaining = Math.max(0, _SPLASH_MIN_MS - elapsed);
    setTimeout(dismissSplash, remaining);

    // Once things have settled, spend a moment of genuine idle time
    // benchmarking blur for real (first load / no cached verdict only).
    scheduleIdleBenchmark();
  } catch (error) {
    clearTimeout(_initTimeoutId);
    console.error("Initialization failed:", error);
    const elapsed = Date.now() - _splashStartTime;
    const remaining = Math.max(0, _SPLASH_MIN_MS - elapsed);
    setTimeout(showSplashError, remaining);
  }
}

// Fetches occupancy data in the background (independent of the splash
// screen) and populates everything that depends on it once it's ready.
async function initOccupancyData() {
  await fetchClassroomsData();

  // Use the fetched data to set the only valid dates into the date picker
  setupDatePicker(() => preferInitialDate);
  document.getElementById("available-classrooms-form").removeAttribute("data-loading");
  document.querySelector("date-chip-picker")?.removeAttribute("data-loading");

  setupDataFetchIndicator();
  setupLiveSearch();

  // If a classroom detail page was opened before occupancy data arrived
  // (e.g. a direct link), fill in its status badge and timeline now.
  classroomDetail.refreshOccupancy();
  renderFavourites();

  const autoSearchEnabled = localStorage.getItem(AUTO_SEARCH_KEY) !== "false";

  if (autoSearchEnabled) {
    document
      .getElementById("available-classrooms-form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  }
}

// ---------- FORM 1: AVAILABLE CLASSROOMS ----------
// Setup the 'Available Classrooms' form
document.getElementById("available-classrooms-form").addEventListener("submit", (e) => {
  // Skip default submit behavior since we will handle it with JavaScript
  e.preventDefault();

  // Haptic feedback
  haptics.trigger(defaultPatterns.light);

  // Check if data was already fetched
  if (!classroomsData.length) {
    console.warn("Data not yet loaded, please wait...");

    return;
  }

  // Read input data
  const data = new FormData(e.target);
  const campus = data.get("campus");
  const date = data.get("date"); // comes from the hidden select
  const from = data.get("from");
  const to = data.get("to");

  // Compute results
  const results = findAvailableClassrooms(campus, date, from, to);

  // Render results
  renderAvailableClassroomsResults(results, date, from, to, campus);
});

const TIME_MIN_MINS = 7 * 60 + 15; // 07:15

const TIME_MAX_MINS = 20 * 60 + 15; // 20:15

// Set by setupTimePickers when the current time is after 20:15 (need tomorrow's date)
let preferInitialDate = null;

// Sets up the time pickers to ensure that the 'to' time
// is always at least 1 hour after the 'from' time, within 07:15–20:15
function setupTimePickers() {
  const fromPicker = document.getElementById("from-time-picker");
  const toPicker = document.getElementById("to-time-picker");

  function toMinutes(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);

    return h * 60 + m;
  }

  function formatMins(mins) {
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }

  function formatTime(date) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  fromPicker.addEventListener("input", () => {
    if (!fromPicker.value) return;

    const fromMins = toMinutes(fromPicker.value);
    const minToMins = Math.min(fromMins + 60, TIME_MAX_MINS);
    toPicker.min = formatMins(minToMins);

    if (toPicker.value && toMinutes(toPicker.value) < minToMins) {
      toPicker.value = formatMins(minToMins);
    }
  });

  toPicker.addEventListener("input", () => {
    if (!toPicker.value || !fromPicker.value) return;

    const diffMinutes = toMinutes(toPicker.value) - toMinutes(fromPicker.value);

    if (diffMinutes < 60) {
      const corrected = Math.min(toMinutes(fromPicker.value) + 60, TIME_MAX_MINS);
      toPicker.value = formatMins(corrected);
    }
  });

  // Set initial values
  const intervalHours = parseInt(localStorage.getItem(INTERVAL_HOURS_KEY), 10) || 2;
  const now = new Date();

  // Snap to next :15 slot
  const snapped = new Date(now);
  snapped.setMinutes(15, 0, 0);

  if (now.getMinutes() >= 15) snapped.setHours(snapped.getHours() + 1);

  const snappedMins = snapped.getHours() * 60 + snapped.getMinutes();

  if (snappedMins > TIME_MAX_MINS) {
    // After 20:15 → next non-skipped day at 07:15; signal date picker to advance
    do {
      snapped.setDate(snapped.getDate() + 1);
    } while (SKIP_DAYS.includes(snapped.getDay()));

    snapped.setHours(7, 15, 0, 0);
    preferInitialDate = [
      snapped.getFullYear(),
      String(snapped.getMonth() + 1).padStart(2, "0"),
      String(snapped.getDate()).padStart(2, "0"),
    ].join("-");
  } else if (snappedMins < TIME_MIN_MINS) {
    // Before 07:15 → today at 07:15
    snapped.setHours(7, 15, 0, 0);
  }

  let fromMins = snapped.getHours() * 60 + snapped.getMinutes();
  let toMins = fromMins + intervalHours * 60;

  if (toMins > TIME_MAX_MINS) {
    toMins = TIME_MAX_MINS;
    fromMins = Math.max(TIME_MIN_MINS, toMins - Math.max(60, intervalHours * 60));
    // Re-sync snapped object for formatTime(snapped)
    snapped.setHours(Math.floor(fromMins / 60), fromMins % 60, 0, 0);
  }

  const minToMins = Math.min(fromMins + 60, TIME_MAX_MINS);

  fromPicker.value = formatTime(snapped);
  toPicker.value = formatMins(toMins);
  toPicker.min = formatMins(minToMins);
}

function setupDataFetchIndicator() {
  const indicator = document.getElementById("data-fetch-indicator");

  if (!classroomsData.length) {
    indicator.classList.add("red");

    return;
  }

  const today = new Date();

  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("");

  const generationDate = new Date(classroomsData[0].generated_at + "Z");

  const generationKey = [
    generationDate.getFullYear(),
    String(generationDate.getMonth() + 1).padStart(2, "0"),
    String(generationDate.getDate()).padStart(2, "0"),
  ].join("");

  const hasFutureData = classroomsData.some((entry) => entry.date > todayKey);

  if (generationKey === todayKey) {
    // Generated today — fresh
    indicator.classList.add("green");
  } else if (hasFutureData) {
    // Not generated today but still has upcoming days — tolerable
    indicator.classList.add("yellow");
  } else {
    // No future data at all — outdated
    indicator.classList.add("red");
  }

  setupDataFetchIndicatorText();
}

// Setups the text inside the popover shown in the Data Fetch Indicator
function setupDataFetchIndicatorText(animate = false) {
  const indicator = document.getElementById("data-fetch-indicator");
  const status = ["green", "yellow", "red"].find((s) => indicator.classList.contains(s)) ?? "red";
  const generationDate = classroomsData[0] ? new Date(classroomsData[0].generated_at + "Z") : null;
  renderDataFetchStatus(status, generationDate, reloadOccupancyData, animate);
}

async function reloadOccupancyData() {
  const btn = document.getElementById("reload-data-btn");

  if (!btn || btn.disabled) return;

  setDataFetchReloading(true);

  await fetchClassroomsData();

  const indicator = document.getElementById("data-fetch-indicator");
  indicator.classList.remove("green", "yellow", "red");
  setupDataFetchIndicator();
  setupDatePicker(() => preferInitialDate);

  const resultsContainer = document.getElementById("available-classrooms-results");

  if (resultsContainer && !resultsContainer.classList.contains("empty")) {
    document
      .getElementById("available-classrooms-form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  }
}

// ---------- LIVE SEARCH ----------

function setupLiveSearch() {
  const form = document.getElementById("available-classrooms-form");
  const results = document.getElementById("available-classrooms-results");

  function isEnabled() {
    return localStorage.getItem(LIVE_SEARCH_KEY) !== "false";
  }

  function trigger() {
    if (!isEnabled() || !classroomsData.length || !results.dataset.searched) return;
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  }

  let debounceTimer = null;

  function triggerDebounced() {
    if (!isEnabled()) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(trigger, 320);
  }

  document.addEventListener("campuschange", trigger);
  document.getElementById("date-picker").addEventListener("change", trigger);
  document.getElementById("from-time-picker").addEventListener("input", triggerDebounced);
  document.getElementById("to-time-picker").addEventListener("input", triggerDebounced);
}

let hasVisitedPage = false;

// File-route components provide already-decoded parameters after startup.
export function showPage(page, id, campus, name) {
  const initial = !hasVisitedPage;
  hasVisitedPage = true;
  window.dispatchEvent(new Event("poliaule:routechange"));

  if (page === "info") {
    infoPage.openRoute();
    classroomDetail.leaveRoute("info");
  } else if (page === "classroom") {
    infoPage.leaveRoute("classroom");
    classroomDetail.openRoute(id, campus, name, initial);
  } else {
    infoPage.leaveRoute("home");
    classroomDetail.leaveRoute("home");
  }
}
