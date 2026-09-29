import { closePage } from "../../lib/navigation";
import { leavePage, openInApp } from "../state/navigation-context";
import { useCallback, useRef, useState } from "react";
import { LOCALES, setLocale, t, useLocale } from "../i18n";
import { campuses } from "../state/availability";
import { setCampus, useStore } from "../state/store";
import { Icon } from "./icon";
import { OptionList, Popup, type MenuGroup } from "./popup";

function CampusSelect() {
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
    <>
      <button
        ref={trigger}
        type="button"
        className="campus-select"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!ready}
        onClick={() => setOpen(!open)}
      >
        <Icon name="location-01" className="campus-select__icon" />
        <span className="campus-select__text">
          <span className="campus-select__label">{t("campus.label")}</span>
          <span className="campus-select__value">{current?.name ?? "…"}</span>
        </span>
        <Icon name="arrow-down-01" className="campus-select__chevron" />
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
    </>
  );
}

function LanguageToggle() {
  const locale = useLocale();

  return (
    <div className="lang-toggle" role="group" aria-label={t("header.language")}>
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          className="lang-toggle__option"
          aria-pressed={option === locale}
          lang={option}
          aria-label={option === "it" ? "Italiano" : "English"}
          onClick={() => setLocale(option)}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function Header({ page }: { page: "home" | "classroom" | "info" }) {
  useLocale();

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <a
          className="brand"
          href="./"
          aria-label={t("header.home")}
          onClick={(event) => {
            event.preventDefault();
            closePage();
          }}
        >
          <img className="brand__logo" src="/brand/polinetwork.svg" alt="" width="36" height="36" />
          <span className="brand__name">PoliNetwork</span>
          <span className="brand__product">{t("app.name")}</span>
        </a>

        {page === "home" && <CampusSelect />}

        <div className="app-header__actions">
          <LanguageToggle />
          <button
            type="button"
            className="icon-button"
            aria-label={t("header.info")}
            title={t("header.info")}
            aria-current={page === "info" ? "page" : undefined}
            onClick={() => (page === "info" ? leavePage() : openInApp("/info"))}
          >
            <Icon name="information-circle" />
          </button>
        </div>
      </div>
    </header>
  );
}
