import { flushSync } from "react-dom";
import { classroomsData } from "../available-rooms-script";
import { getLocale } from "../i18n";

export interface PickerDay {
  date: string;
  weekday: string;
  day: number;
  sunday: boolean;
  skipped: boolean;
}

export interface DatePickerData {
  days: PickerDay[];
  options: string[];
  getPreferInitialDate: () => string | null;
}

let data: DatePickerData | null = null;

const listeners = new Set<() => void>();

export function subscribeDates(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getDatePickerData() {
  return data;
}

export function formatLocalDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseDateKey(key: string) {
  const [year, month, day] = [key.slice(0, 4), key.slice(4, 6), key.slice(6, 8)].map(Number);

  return new Date(year, month - 1, day);
}

// Keep the startup controller's synchronous contract until it moves to React.
// The preferred date is read after fonts settle, since time setup can set it later.
export function setupDatePicker(getPreferInitialDate: () => string | null = () => null) {
  const availableDates = classroomsData.map((day) => day.date);
  const formatter = new Intl.DateTimeFormat(getLocale(), { weekday: "narrow" });

  const dayNames = Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(2000, 0, 2 + index)),
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseDateKey(availableDates[0]);
  const end = parseDateKey(availableDates[availableDates.length - 1]);
  const cursor = today < start ? today : start;
  const days: PickerDay[] = [];
  // Upstream appends options when dates reload. Preserve the current select
  // value until the deferred initial selection, including during a data reload.
  const options = [...(data?.options ?? [])];

  while (cursor <= end) {
    const date = formatLocalDate(cursor);
    const parsed = new Date(date);
    const skipped = !availableDates.includes(date.replace(/-/g, ""));
    days.push({
      date,
      weekday: dayNames[parsed.getDay()],
      day: parsed.getDate(),
      sunday: parsed.getDay() === 0,
      skipped,
    });

    if (!skipped) options.push(date);
    cursor.setDate(cursor.getDate() + 1);
  }

  data = { days, options, getPreferInitialDate };
  flushSync(() => listeners.forEach((listener) => listener()));
}
