import { getRomeNow } from "../available-rooms-script";

// Lessons and opening hours are published on a 07:15–20:15 grid, in Europe/Rome
// wall-clock time. Times travel through the app as "HH:MM" strings, which sort
// and compare correctly as plain strings.
export const DAY_START = 7 * 60 + 15;

export const DAY_END = 20 * 60 + 15;

export const STEP_MINUTES = 15;

const DEFAULT_WINDOW = 2 * 60;

export function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

export function fromMinutes(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Every selectable boundary between DAY_START and DAY_END, in STEP_MINUTES steps. */
export const TIME_OPTIONS = Array.from(
  { length: (DAY_END - DAY_START) / STEP_MINUTES + 1 },
  (_, index) => fromMinutes(DAY_START + index * STEP_MINUTES),
);

/** Formats an "HH:MM" string for display; the app always uses the 24-hour clock. */
export function formatTime(time: string) {
  return /^\d{2}:\d{2}$/.test(time) ? time.replace(/^0(\d)/, "$1") : time;
}

export function formatRange(from: string, to: string) {
  return `${formatTime(from)}–${formatTime(to)}`;
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (!hours) return `${rest} min`;

  return rest ? `${hours} h ${rest}` : `${hours} h`;
}

/** Rome's current time, floored to the grid and clamped into the day's opening window. */
export function currentSlotStart() {
  const now = getRomeNow();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const floored = Math.floor(minutes / STEP_MINUTES) * STEP_MINUTES;

  return Math.min(Math.max(floored, DAY_START), DAY_END - 60);
}

export function isAfterHours() {
  const now = getRomeNow();

  return now.getHours() * 60 + now.getMinutes() >= DAY_END - 30;
}

/** The default search window: from now (or the day's opening, after hours) for two hours. */
export function defaultWindow(afterHours: boolean) {
  const from = afterHours ? DAY_START : currentSlotStart();

  return { from: fromMinutes(from), to: fromMinutes(Math.min(from + DEFAULT_WINDOW, DAY_END)) };
}

/** Keeps a from/to pair valid after one side changed: at least one step apart, inside the day. */
export function normaliseWindow(from: string, to: string, changed: "from" | "to") {
  let start = toMinutes(from);
  let end = toMinutes(to);

  if (end - start >= STEP_MINUTES) return { from, to };

  if (changed === "from") {
    end = Math.min(start + 60, DAY_END);
    start = Math.min(start, end - STEP_MINUTES);
  } else {
    start = Math.max(end - 60, DAY_START);
    end = Math.max(end, start + STEP_MINUTES);
  }

  return { from: fromMinutes(start), to: fromMinutes(end) };
}

export function isoToDateKey(iso: string) {
  return iso.replace(/-/g, "");
}

export function dateKeyToIso(key: string) {
  return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
}

/** Parses a "YYYY-MM-DD" string into a local Date without the UTC shift of `new Date(iso)`. */
export function parseIsoDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);

  return new Date(year, month - 1, day);
}

export function romeTodayIso() {
  const now = getRomeNow();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function capitalise(text: string, locale: string) {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}
