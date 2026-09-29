import { useCallback, useRef, useState } from "react";
import { t, useLocale } from "../i18n";
import { campuses } from "../state/availability";
import { setCampus, useStore } from "../state/store";
import { Icon } from "../ui/icon";
import { OptionList, Popup, type MenuGroup } from "../ui/popup";

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
    <section className="panel" aria-labelledby="where-title">
      <div className="panel__header">
        <h2 className="panel__title" id="where-title">
          <Icon name="location-01" />
          {t("where.title")}
        </h2>
      </div>
      <button
        ref={trigger}
        type="button"
        className="campus-select"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t("campus.label")}: ${current?.name ?? ""}`}
        disabled={!ready}
        onClick={() => setOpen(!open)}
      >
        <span className="campus-select__text">
          <span className="campus-select__value">{current?.name ?? "…"}</span>
          <span className="campus-select__label">
            {current ? [current.group, current.city].filter(Boolean).join(" · ") : ""}
          </span>
        </span>
        <span className="campus-select__change">
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
    </section>
  );
}
