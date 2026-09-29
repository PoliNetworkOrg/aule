import { useCallback, useRef, useState } from "react";
import { t, tf, useLocale } from "../i18n";
import { findCampus } from "../state/availability";
import {
  countActiveFilters,
  countAdvancedFilters,
  DEFAULT_FILTERS,
  resetFilters,
  setFilters,
  useStore,
  type Filters as FilterState,
  type SeatsFilter,
} from "../state/store";
import { Icon } from "../ui/icon";
import { Popup } from "../ui/popup";
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

function MoreFilters({ filters, onDone }: { filters: FilterState; onDone: () => void }) {
  useLocale();
  const campusId = useStore((state) => state.campusId);
  const buildings = findCampus(campusId)?.buildings ?? [];

  return (
    <div className="more-filters">
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

      <div className="more-filters__actions">
        <button
          type="button"
          className="button button--ghost"
          disabled={countAdvancedFilters(filters) === 0}
          onClick={() =>
            setFilters({
              minSeats: DEFAULT_FILTERS.minSeats,
              building: DEFAULT_FILTERS.building,
              network: DEFAULT_FILTERS.network,
            })
          }
        >
          <StableText k="filters.clearMore" />
        </button>
        <button type="button" className="button button--primary" onClick={onDone}>
          <StableText k="filters.done" />
        </button>
      </div>
    </div>
  );
}

export function Filters() {
  useLocale();
  const filters = useStore((state) => state.filters);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const advanced = countAdvancedFilters(filters);
  const active = countActiveFilters(filters);

  return (
    <div className="filters">
      <div className="chip-row">
        <ToggleChip
          active={filters.fullyFree}
          icon="time-quarter-pass"
          label="filters.fullyFree"
          onToggle={() => setFilters({ fullyFree: !filters.fullyFree })}
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
          ref={trigger}
          type="button"
          className={`chip${advanced > 0 ? " chip--active" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon name="filter-horizontal" />
          <StableText k="filters.more" />
          {advanced > 0 && <span className="chip__badge">{advanced}</span>}
        </button>
        {active > 0 && (
          <button
            type="button"
            className="chip chip--reset"
            aria-label={tf("filters.resetCount", { n: active })}
            onClick={resetFilters}
          >
            <Icon name="cancel-01" />
            <StableText k="filters.reset" />
          </button>
        )}
      </div>
      <Popup open={open} anchor={trigger} title={t("filters.more")} onClose={close} minWidth={340}>
        <MoreFilters filters={filters} onDone={close} />
      </Popup>
    </div>
  );
}
