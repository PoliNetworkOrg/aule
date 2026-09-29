import { useState } from "react";
import { t, tf, useLocale } from "../i18n";
import { findCampus } from "../state/availability";
import {
  countActiveFilters,
  countAdvancedFilters,
  resetFilters,
  setFilters,
  useStore,
  type Filters as FilterState,
  type SeatsFilter,
} from "../state/store";
import { Icon } from "../ui/icon";

const SEAT_OPTIONS: SeatsFilter[] = [0, 30, 60, 100, 200];

function ToggleChip({
  active,
  icon,
  label,
  onToggle,
}: {
  active: boolean;
  icon: string;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="chip" aria-pressed={active} onClick={onToggle}>
      <Icon name={active ? "checkmark-circle-02" : icon} />
      {label}
    </button>
  );
}

function MoreFilters({ filters }: { filters: FilterState }) {
  const campusId = useStore((state) => state.campusId);
  const buildings = findCampus(campusId)?.buildings ?? [];

  return (
    <div className="more-filters" id="more-filters">
      <fieldset className="field">
        <legend className="field__label">{t("filters.seats")}</legend>
        <div className="segmented" role="radiogroup" aria-label={t("filters.seats")}>
          {SEAT_OPTIONS.map((seats) => (
            <button
              key={seats}
              type="button"
              role="radio"
              aria-checked={filters.minSeats === seats}
              className="segmented__option"
              onClick={() => setFilters({ minSeats: seats })}
            >
              {seats ? `${seats}+` : t("filters.any")}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span className="field__label">{t("filters.building")}</span>
        <span className="select">
          <select
            className="select__native"
            value={filters.building}
            onChange={(event) => setFilters({ building: event.target.value })}
          >
            <option value="">{t("filters.allBuildings")}</option>
            {buildings.map((building) => (
              <option key={building.name} value={building.name}>
                {t("building.prefix")} {building.name}
                {building.altName ? ` · ${building.altName}` : ""}
              </option>
            ))}
          </select>
          <Icon name="arrow-down-01" className="select__chevron" />
        </span>
      </label>

      <fieldset className="field">
        <legend className="field__label">{t("filters.equipment")}</legend>
        <div className="chip-row chip-row--wrap">
          <ToggleChip
            active={filters.network}
            icon="cable"
            label={t("filters.network")}
            onToggle={() => setFilters({ network: !filters.network })}
          />
        </div>
      </fieldset>
    </div>
  );
}

export function Filters() {
  useLocale();
  const filters = useStore((state) => state.filters);
  const [open, setOpen] = useState(() => countAdvancedFilters(filters) > 0);
  const advanced = countAdvancedFilters(filters);
  const active = countActiveFilters(filters);

  return (
    <div className="filters">
      <div className="chip-row">
        <ToggleChip
          active={filters.fullyFree}
          icon="time-quarter-pass"
          label={t("filters.fullyFree")}
          onToggle={() => setFilters({ fullyFree: !filters.fullyFree })}
        />
        <ToggleChip
          active={filters.sockets}
          icon="plug-socket"
          label={t("filters.sockets")}
          onToggle={() => setFilters({ sockets: !filters.sockets })}
        />
        <ToggleChip
          active={filters.accessible}
          icon="wheelchair"
          label={t("filters.accessible")}
          onToggle={() => setFilters({ accessible: !filters.accessible })}
        />
        <button
          type="button"
          className="chip"
          aria-expanded={open}
          aria-controls="more-filters"
          onClick={() => setOpen(!open)}
        >
          <Icon name="filter-horizontal" />
          {t("filters.more")}
          {advanced > 0 && <span className="chip__badge">{advanced}</span>}
        </button>
        {active > 0 && (
          <button
            type="button"
            className="chip chip--reset"
            aria-label={tf("filters.resetCount", { n: active })}
            onClick={resetFilters}
          >
            {t("filters.reset")}
          </button>
        )}
      </div>
      {open && <MoreFilters filters={filters} />}
    </div>
  );
}
