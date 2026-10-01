import { Fragment, useState } from "react";
import { cn } from "../../lib/cn";
import { t, tf, useLocale } from "../i18n";
import { findCampus } from "../state/availability";
import {
  buildingKey,
  countActiveFilters,
  countAdvancedFilters,
  resetFilters,
  setFilters,
  useStore,
  type Filters as FilterState,
  type SeatsFilter,
} from "../state/store";
import { Chip, ChipRow } from "../ui/chip";
import { Field, FieldLabel } from "../ui/field";
import { centreStable, insetFocus } from "../ui/focus";
import { Icon } from "../ui/icon";
import { pressable } from "../ui/motion";
import { Panel, PanelHeader, PanelTitle } from "../ui/panel";
import { Segmented, SegmentedOption } from "../ui/segmented";
import { StableText } from "../ui/stable";
import { buildingLabel } from "./campus-label";

const SEAT_OPTIONS: SeatsFilter[] = [0, 30, 60, 100, 200];

/**
 * Phones and tablets: while "More filters" is open, the other panels of the
 * controls (`group/controls`, home-page.tsx) make room for it.
 */
export const hiddenByMoreFilters = "max-lg:group-has-[#more-filters]/controls:hidden";

/** A building choice. */
const choice = cn(
  "h-9.5 rounded-sm bg-surface-muted px-1.5 text-14 font-semibold whitespace-nowrap transition-[background-color,color,scale]",
  pressable,
  "hover:bg-accent-soft hover:text-accent-strong aria-pressed:bg-accent aria-pressed:text-on-accent",
  insetFocus,
  centreStable,
);

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
    <Chip aria-pressed={active} onClick={onToggle}>
      <Icon name={active ? "checkmark-circle-02" : icon} />
      {t(label)}
    </Chip>
  );
}

function MoreFilters({ filters }: { filters: FilterState }) {
  useLocale();
  const campusIds = useStore((state) => state.campusIds);
  const selected = campusIds.flatMap((id) => findCampus(id) ?? []);

  return (
    <div
      className={cn(
        "grid scroll-mt-4 gap-4.5 rounded-lg border border-border bg-surface p-4",
        // Settles in from just above as it opens; no height animation, so the
        // panels below simply move down. Closing (unmount) is instant.
        "transition-[opacity,translate] duration-250 ease-smooth-out starting:-translate-y-1 starting:opacity-0",
      )}
      id="more-filters"
    >
      <Field>
        <FieldLabel>{t("filters.seats")}</FieldLabel>
        <Segmented fill role="group" aria-label={t("filters.seats")}>
          {SEAT_OPTIONS.map((seats) => (
            <SegmentedOption
              key={seats}
              fill
              aria-pressed={filters.minSeats === seats}
              onClick={() => setFilters({ minSeats: seats })}
            >
              {seats ? `${seats}+` : <StableText k="filters.any" />}
            </SegmentedOption>
          ))}
        </Segmented>
      </Field>

      <Field>
        <FieldLabel>{t("filters.building")}</FieldLabel>
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5"
          role="group"
          aria-label={t("filters.building")}
        >
          <button
            type="button"
            className={cn(choice, "col-[span_2]")}
            aria-pressed={filters.building === ""}
            onClick={() => setFilters({ building: "" })}
          >
            <StableText k="filters.allBuildings" />
          </button>
          {selected.map((campus) => (
            <Fragment key={campus.id}>
              {/* Several campuses: each one's buildings under its name ("8" is in two). */}
              {selected.length > 1 && (
                <p className="col-span-full pt-1 text-12 font-bold text-subtle">{campus.name}</p>
              )}
              {campus.buildings.map((building) => {
                const key = buildingKey(campus.id, building.name);

                return (
                  <button
                    key={key}
                    type="button"
                    className={choice}
                    aria-pressed={filters.building === key}
                    aria-label={buildingLabel(key, selected.length > 1)}
                    title={building.altName || undefined}
                    onClick={() => setFilters({ building: filters.building === key ? "" : key })}
                  >
                    {building.name}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </Field>

      <Field>
        <FieldLabel>{t("filters.equipment")}</FieldLabel>
        <ChipRow>
          <ToggleChip
            active={filters.network}
            icon="cable"
            label="filters.network"
            onToggle={() => setFilters({ network: !filters.network })}
          />
        </ChipRow>
      </Field>
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
    <Panel
      className={cn(
        "gap-2.5",
        // Divided from the panel above, except on phones and tablets while it's
        // the only panel shown (see hiddenByMoreFilters).
        open ? "lg:border-t lg:border-t-border lg:pt-3" : "border-t border-t-border pt-3",
      )}
      aria-labelledby="filters-title"
    >
      <PanelHeader>
        <PanelTitle id="filters-title">
          <Icon name="filter-horizontal" />
          {t("filters.title")}
        </PanelTitle>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-busy-soft px-2.5 text-13 font-bold text-busy hover:bg-busy/16"
          hidden={active === 0}
          aria-label={tf("filters.resetCount", { n: active })}
          onClick={resetFilters}
        >
          <Icon name="cancel-01" />
          {t("filters.reset")}
          <span className="inline-grid h-4.5 min-w-4.5 place-items-center rounded-full bg-busy text-11 text-on-status">
            {active}
          </span>
        </button>
      </PanelHeader>
      <ChipRow>
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
        <Chip
          variant={advanced > 0 ? "active" : "default"}
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
          {t("filters.more")}
          {advanced > 0 && (
            <span className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-12 font-bold text-on-accent">
              {advanced}
            </span>
          )}
          <Icon
            name="arrow-down-01"
            // In step with the "More filters" panel it discloses.
            className={cn(
              "text-14 transition-[rotate] duration-250 ease-smooth-out",
              open && "rotate-180",
            )}
          />
        </Chip>
      </ChipRow>
      {open && <MoreFilters filters={filters} />}
    </Panel>
  );
}
