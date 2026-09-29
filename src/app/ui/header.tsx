import { closePage, openPage } from "../../lib/navigation";
import { setLocale, t, useLocale } from "../i18n";
import { campuses } from "../state/availability";
import { setCampus, useStore } from "../state/store";
import { Icon } from "./icon";

function CampusSelect() {
  useLocale();
  const campusId = useStore((state) => state.campusId);
  const ready = useStore((state) => state.directory === "ready");
  const list = ready ? campuses() : [];
  const current = list.find((campus) => campus.id === campusId);
  const cities = new Map<string, typeof list>();

  for (const campus of list) {
    const city = campus.group ? (campus.city ?? "") : t("campus.otherCities");

    const group = cities.get(city) ?? [];

    group.push(campus);
    cities.set(city, group);
  }

  return (
    <label className="campus-select">
      <Icon name="location-01" className="campus-select__icon" />
      <span className="campus-select__text">
        <span className="campus-select__label">{t("campus.label")}</span>
        <span className="campus-select__value">{current?.name ?? "…"}</span>
      </span>
      <Icon name="arrow-down-01" className="campus-select__chevron" />
      <select
        className="campus-select__native"
        value={campusId}
        aria-label={t("campus.label")}
        disabled={!ready}
        onChange={(event) => setCampus(event.target.value)}
      >
        {[...cities].map(([city, group]) => (
          <optgroup key={city} label={city}>
            {group.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.group ? `${campus.name} · ${campus.group}` : campus.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function LanguageToggle() {
  const locale = useLocale();
  const next = locale === "it" ? "en" : "it";

  return (
    <button
      type="button"
      className="icon-button icon-button--text"
      aria-label={t("header.switchLanguage")}
      title={t("header.switchLanguage")}
      onClick={() => void setLocale(next)}
    >
      {next.toUpperCase()}
    </button>
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

        <div className="app-header__actions">
          {page === "home" && <CampusSelect />}
          <LanguageToggle />
          <button
            type="button"
            className="icon-button"
            aria-label={t("header.info")}
            title={t("header.info")}
            aria-current={page === "info" ? "page" : undefined}
            onClick={() => (page === "info" ? closePage() : openPage("/info"))}
          >
            <Icon name="information-circle" />
          </button>
        </div>
      </div>
    </header>
  );
}
