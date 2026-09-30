import { useCallback, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { t, useLocale } from "../i18n";
import { campuses } from "../state/availability";
import { setCampus, useStore } from "../state/store";
import { Icon } from "../ui/icon";
import { Panel, PanelHeader, PanelTitle } from "../ui/panel";
import { OptionList, Popup, type MenuGroup } from "../ui/popup";
import { hiddenByMoreFilters } from "./filters";

/** "Where": the campus, first of the search parameters. */
export function WherePanel() {
  useLocale();
  const campusId = useStore((state) => state.campusId);
  const ready = useStore((state) => state.directory === "ready");
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const list = ready ? campuses() : [];
  const current = list.find((campus) => campus.id === campusId);
  const groups = new Map<string, MenuGroup>();

  for (const campus of list) {
    const label = campus.group ? (campus.city ?? "") : t("campus.otherCities");
    const group = groups.get(label) ?? { label, options: [] };

    group.options.push({ value: campus.id, label: campus.name, description: campus.group });
    groups.set(label, group);
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
          "flex min-h-13 w-full items-center gap-3 rounded-md border border-border bg-surface px-3.5 py-1.5 text-left",
          "transition-[border-color] hover:border-accent aria-expanded:border-accent",
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t("campus.label")}: ${current?.name ?? ""}`}
        disabled={!ready}
        onClick={() => setOpen(!open)}
      >
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-17 font-bold">{current?.name ?? "…"}</span>
          <span className="text-13 text-muted">
            {current ? [current.group, current.city].filter(Boolean).join(" · ") : ""}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-13 font-bold text-accent-strong">
          {t("where.change")}
          <Icon name="arrow-down-01" />
        </span>
      </button>
      <Popup open={open} anchor={trigger} title={t("campus.choose")} onClose={close}>
        <OptionList
          groups={[...groups.values()]}
          value={campusId}
          onSelect={(value) => {
            setCampus(value);
            close();
          }}
        />
      </Popup>
    </Panel>
  );
}
