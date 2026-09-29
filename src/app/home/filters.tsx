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
import { StableText } from "../ui/stable";

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
      <StableText k={label} />
    </button>
  );
}

function MoreFilters({ filters }: { filters: FilterState }) {
  useLocale();
  const campusId = useStore((state) => state.campusId);
  const buildings = findCampus(campusId)?.buildings ?? [];

  return (
    <div className="more-filters" id="more-filters">
      <fieldset className="field">
        <legend className="field__label">{t("filters.seats")}</legend>
        <div className="segmented segmented--fill" role="group" aria-label={t("filters.seats")}>
          {SEAT_OPTIONS.map((seats) => (
            <button
              key={seats}
              type="button"
              aria-pressed={filters.minSeats === seats}
              className="segmented__option"
              onClick={() => setFilters({ minSeats: seats })}
            >
              {seats ? `${seats}+` : <StableText k="filters.any" />}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="field__label">{t("filters.building")}</legend>
        <div className="choice-grid" role="group" aria-label={t("filters.building")}>
          <button
            type="button"
            className="choice choice--wide"
            aria-pressed={filters.building === ""}
            onClick={() => setFilters({ building: "" })}
          >
            <StableText k="filters.allBuildings" />
          </button>
          {buildings.map((building) => (
            <button
              key={building.name}
              type="button"
              className="choice"
              aria-pressed={filters.building === building.name}
              aria-label={`${t("building.prefix")} ${building.name}`}
              title={building.altName || undefined}
              onClick={() =>
                setFilters({ building: filters.building === building.name ? "" : building.name })
              }
            >
              {building.name}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="field__label">{t("filters.equipment")}</legend>
        <div className="chip-row chip-row--wrap">
          <ToggleChip
            active={filters.network}
            icon="cable"
            label="filters.network"
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
  const advanced = countAdvancedFilters(filters);
  const active = countActiveFilters(filters);
  const [open, setOpen] = useState(() => advanced > 0);

  return (
    <section className="panel filters" aria-labelledby="filters-title">
      <div className="panel__header">
        <h2 className="panel__title" id="filters-title">
          <Icon name="filter-horizontal" />
          {t("filters.title")}
        </h2>
        <button
          type="button"
          className="action-link"
          hidden={active === 0}
          aria-label={tf("filters.resetCount", { n: active })}
          onClick={resetFilters}
        >
          <Icon name="cancel-01" />
          <StableText k="filters.reset" />
          <span className="action-link__count">{active}</span>
        </button>
      </div>
      <div className="chip-row chip-row--wrap">
        <ToggleChip
          active={filters.partial}
          icon="time-quarter-pass"
          label="filters.partial"
          onToggle={() => setFilters({ partial: !filters.partial })}
        />
        <ToggleChip
          active={filters.sockets}
          icon="plug-socket"
          label="filters.sockets"
          onToggle={() => setFilters({ sockets: !filters.sockets })}
        />
        <ToggleChip
          active={filters.accessible}
          icon="wheelchair"
          label="filters.accessible"
          onToggle={() => setFilters({ accessible: !filters.accessible })}
        />
        <button
          type="button"
          className={`chip${advanced > 0 ? " chip--active" : ""}`}
          aria-expanded={open}
          aria-controls="more-filters"
          onClick={() => {
            setOpen(!open);

            if (!open && window.matchMedia("(max-width: 959px)").matches) {
              requestAnimationFrame(() =>
                document.getElementById("more-filters")?.scrollIntoView({ block: "start" }),
              );
            }
          }}
        >
          <Icon name="filter-horizontal" />
          <StableText k="filters.more" />
          {advanced > 0 && <span className="chip__badge">{advanced}</span>}
          <Icon
            name="arrow-down-01"
            className={`chip__chevron${open ? " chip__chevron--open" : ""}`}
          />
        </button>
      </div>
      {open && <MoreFilters filters={filters} />}
    </section>
  );
}
