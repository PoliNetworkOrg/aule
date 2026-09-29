import {
  classroomsData as occupancyDays,
  fetchClassroomsData,
  hasOpeningHours,
} from "./available-rooms-script";
import { ensureClassroomDirectory } from "./classroom-search-data";
import { initI18n } from "./i18n";
import { availableDates, findCampus, campuses } from "./state/availability";
import { readState, setState } from "./state/store";
import { defaultWindow, isAfterHours, romeTodayIso } from "./state/time";

// Startup: translations and the classroom directory are needed to draw the
// shell, so the splash waits for them; occupancy loads in parallel and fills
// in results, day picker and statuses when it lands.

let started: Promise<void> | null = null;

function dismissSplash() {
  const splash = document.getElementById("splash-overlay");

  if (!splash) return;

  splash.classList.add("splash-hiding");
  window.setTimeout(() => splash.remove(), 250);
}

function showSplashError() {
  const splash = document.getElementById("splash-overlay");

  if (!splash) return;

  splash.classList.add("splash-error");
  splash.replaceChildren();

  const title = document.createElement("p");
  title.className = "splash-error-title";
  title.textContent = "Unable to load";

  const subtitle = document.createElement("p");
  subtitle.className = "splash-error-subtitle";
  subtitle.textContent = "Check your connection and try again.";

  const reload = document.createElement("button");
  reload.className = "button button--primary";
  reload.textContent = "Reload";
  reload.addEventListener("click", () => location.reload());

  splash.append(title, subtitle, reload);
}

function oldestGeneratedAt() {
  if (!occupancyDays.length) return null;

  const oldest = occupancyDays.reduce(
    (current, day) => (day.generated_at < current ? day.generated_at : current),
    occupancyDays[0].generated_at,
  );

  return new Date(`${oldest}Z`);
}

/** Picks the day to show: keep a still-valid choice, else today, else the next day with data. */
function pickDate(dates: string[], afterHours: boolean) {
  const { date } = readState();

  if (date && dates.includes(date)) return date;

  const today = romeTodayIso();

  if (!afterHours && dates.includes(today)) return today;

  return dates.find((candidate) => candidate > today) ?? dates[0] ?? "";
}

function applyOccupancy() {
  const dates = availableDates();
  const firstLoad = !readState().date;
  const afterHours = isAfterHours();
  const date = pickDate(dates, afterHours);
  const patch = firstLoad && date !== romeTodayIso() ? defaultWindow(true) : {};

  setState({
    ...patch,
    date,
    occupancy: dates.length ? "ready" : "error",
    openingHours: hasOpeningHours(),
    generatedAt: oldestGeneratedAt(),
    dataRevision: readState().dataRevision + 1,
  });
}

export async function reloadOccupancy() {
  setState({ occupancy: "loading" });
  await fetchClassroomsData();
  applyOccupancy();
}

export function startApplication() {
  started ??= (async () => {
    const timeout = window.setTimeout(showSplashError, 15000);

    const occupancy = fetchClassroomsData().then(applyOccupancy, () =>
      setState({ occupancy: "error" }),
    );

    try {
      await Promise.all([initI18n(), ensureClassroomDirectory()]);

      if (!findCampus(readState().campusId))
        setState({ campusId: campuses()[0]?.id ?? readState().campusId });

      setState({ directory: "ready" });
      window.clearTimeout(timeout);
      dismissSplash();
    } catch (error) {
      console.error("Initialization failed:", error);
      window.clearTimeout(timeout);
      setState({ directory: "error" });
      showSplashError();
    }

    await occupancy;
  })();

  return started;
}
