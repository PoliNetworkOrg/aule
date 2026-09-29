import { closePage } from "../../lib/navigation";
import { leavePage, openInApp } from "../state/navigation-context";
import { LOCALES, setLocale, t, useLocale } from "../i18n";
import { setTheme, useTheme } from "../theme";
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
  const theme = useTheme();
  const themeLabel = t(theme === "dark" ? "header.lightMode" : "header.darkMode");

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
          <img
            className="brand__logo"
            src="/brand/logo-40.png"
            srcSet="/brand/logo-40.png 1x, /brand/logo-80.png 2x, /brand/logo-120.png 3x"
            alt=""
            width="40"
            height="40"
          />
          <span className="brand__name">PoliNetwork</span>
          <span className="brand__product">{t("app.name")}</span>
        </a>

        <div className="app-header__actions">
          <LanguageToggle />
          <button
            type="button"
            className="icon-button"
            aria-label={themeLabel}
            title={themeLabel}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
              {theme === "dark" ? (
                <path d="M9.37 5.51A7.35 7.35 0 0 0 9.1 7.5c0 4.08 3.32 7.4 7.4 7.4.68 0 1.35-.09 1.99-.27A7.014 7.014 0 0 1 12 19c-3.86 0-7-3.14-7-7 0-2.93 1.81-5.45 4.37-6.49zM12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" />
              ) : (
                <path d="M12 9c1.65 0 3 1.35 3 3s-1.35 3-3 3-3-1.35-3-3 1.35-3 3-3m0-2c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" />
              )}
            </svg>
          </button>
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
