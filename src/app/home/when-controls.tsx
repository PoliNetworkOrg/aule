import { t, useLocale } from "../i18n";
import { availableDates } from "../state/availability";
import { setDate, setState, setWindow, useStore } from "../state/store";
import {
  capitalise,
  defaultWindow,
  formatDuration,
  formatTime,
  parseIsoDate,
  romeTodayIso,
  TIME_OPTIONS,
  toMinutes,
} from "../state/time";
import { Icon } from "../ui/icon";

export function DateStrip() {
  const locale = useLocale();
  const selected = useStore((state) => state.date);
  const status = useStore((state) => state.occupancy);

  useStore((state) => state.dataRevision);

  const dates = availableDates();
  const today = romeTodayIso();
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const month = new Intl.DateTimeFormat(locale, { month: "short" });

  if (!dates.length)
    return (
      <div className="date-strip" aria-busy={status === "loading"}>
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} className="date-strip__skeleton" />
        ))}
      </div>
    );

  return (
    <div className="date-strip" role="group" aria-label={t("when.day")}>
      {dates.map((date, index) => {
        const day = parseIsoDate(date);
        const previous = index > 0 ? parseIsoDate(dates[index - 1]) : null;
        const newMonth = !previous || previous.getMonth() !== day.getMonth();

        return (
          <button
            key={date}
            type="button"

            aria-pressed={date === selected}
            className="date-strip__day"
            onClick={() => setDate(date)}
          >
            <span className="date-strip__weekday">
              {date === today
                ? t("when.today")
                : capitalise(weekday.format(day).replace(/\.$/, ""), locale)}
            </span>
            <span className="date-strip__number">{day.getDate()}</span>
            <span className="date-strip__month" aria-hidden={!newMonth}>
              {newMonth ? month.format(day).replace(/\.$/, "") : " "}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TimeSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="time-select">
      <span className="time-select__label">{label}</span>
      <span className="time-select__value">{formatTime(value)}</span>
      <Icon name="arrow-down-01" className="time-select__chevron" />
      <select
        className="time-select__native"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatTime(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TimeRange() {
  useLocale();
  const from = useStore((state) => state.from);
  const to = useStore((state) => state.to);
  const date = useStore((state) => state.date);
  const today = romeTodayIso();
  const now = defaultWindow(false);
  const isNow = date === today && from === now.from;
  const hasToday = availableDates().includes(today);

  return (
    <div className="time-range">
      <TimeSelect
        label={t("when.from")}
        value={from}
        options={TIME_OPTIONS.slice(0, -1)}
        onChange={(value) => setWindow(value, to, "from")}
      />
      <span className="time-range__separator" aria-hidden="true">
        <Icon name="arrow-right-01" />
      </span>
      <TimeSelect
        label={t("when.to")}
        value={to}
        options={TIME_OPTIONS.slice(1)}
        onChange={(value) => setWindow(from, value, "to")}
      />
      <span className="time-range__duration">
        {formatDuration(toMinutes(to) - toMinutes(from))}
      </span>
      <button
        type="button"
        className="button button--ghost time-range__now"
        disabled={isNow || !hasToday}
        onClick={() => setState({ date: today, ...now })}
      >
        <Icon name="clock-01" />
        {t("when.now")}
      </button>
    </div>
  );
}
