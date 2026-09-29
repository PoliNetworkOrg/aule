import { closePage } from "../../lib/navigation";
import { leavePage, openInApp } from "../state/navigation-context";
import { LOCALES, setLocale, t, useLocale } from "../i18n";
import { Icon } from "./icon";

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
          <img className="brand__logo" src="/brand/logo.svg" alt="" width="40" height="40" />
          <span className="brand__name">PoliNetwork</span>
          <span className="brand__product">{t("app.name")}</span>
        </a>

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
