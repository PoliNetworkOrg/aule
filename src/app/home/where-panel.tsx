import { useCallback, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { t, tf, useLocale } from "../i18n";
import { campuses } from "../state/availability";
import { setCampuses, toggledCampuses, useStore } from "../state/store";
import { Icon } from "../ui/icon";
import { pressableLarge } from "../ui/motion";
import { Panel, PanelHeader, PanelTitle } from "../ui/panel";
import { CheckList, Popup, type CheckGroup } from "../ui/popup";
import { campusSelectionLabel } from "./campus-label";
import { hiddenByMoreFilters } from "./filters";

/** "Where": the campuses, first of the search parameters. */
export function WherePanel() {
  useLocale();
  const campusIds = useStore((state) => state.campusIds);
  const ready = useStore((state) => state.directory === "ready");
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const list = ready ? campuses() : [];
  const order = list.map((campus) => campus.id);
  const label = ready ? campusSelectionLabel(campusIds) : null;
  const groups = new Map<string, CheckGroup>();

  const toggle = (ids: string[], selected: boolean) =>
    setCampuses(toggledCampuses(campusIds, ids, selected, order));

  // Grouped by area (Città Studi, Bovisa), the campuses of other cities together.
  for (const campus of list) {
    const area = campus.group ?? "";
    const group = groups.get(area) ?? { label: area || t("campus.otherCities"), options: [] };

    group.options.push({ value: campus.id, label: campus.name });
    groups.set(area, group);
  }

  // An area with several campuses can be picked whole.
  for (const [area, group] of groups) {
    const ids = group.options.map((option) => option.value);

    if (!area || ids.length < 2) continue;

    const pressed = ids.every((id) => campusIds.includes(id));

    group.toggleAll = {
      text: t("campus.selectAll"),
      label: tf("campus.selectAllLabel", { group: area }),
      pressed,
      onToggle: () => toggle(ids, !pressed),
    };
  }

  return (
    <Panel className={hiddenByMoreFilters} aria-labelledby="where-title">
      <PanelHeader>
        <PanelTitle id="where-title">
          <Icon name="location-01" />
          {t("where.title")}
        </PanelTitle>
      </PanelHeader>
      <button
        ref={trigger}
        type="button"
        className={cn(
          "flex min-h-13 w-full items-center gap-3 rounded-md border border-border-strong bg-surface px-3.5 py-1.5 text-left",
          "transition-[border-color,scale] hover:border-accent aria-expanded:border-accent",
          pressableLarge,
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t("campus.label")}: ${label?.title ?? ""}`}
        disabled={!ready}
        onClick={() => setOpen(!open)}
      >
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-17 font-bold">{label?.title || "…"}</span>
          <span className="truncate text-13 text-muted">{label?.subtitle}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-13 font-bold text-accent-strong">
          {t("where.change")}
          <Icon name="arrow-down-01" />
        </span>
      </button>
      <Popup open={open} anchor={trigger} title={t("campus.choose")} onClose={close}>
        <CheckList
          groups={[...groups.values()]}
          values={campusIds}
          locked={campusIds.length === 1 ? campusIds[0] : null}
          onToggle={(id) => toggle([id], !campusIds.includes(id))}
        />
      </Popup>
    </Panel>
  );
}
