import { cn } from "../../lib/cn";
import { closePage } from "../../lib/navigation";
import { leavePage, openInApp } from "../state/navigation-context";
import { type Locale, LOCALES, setLocale, t, useLocale } from "../i18n";
import { setThemePreference, THEME_PREFERENCES, useThemePreference } from "../theme";
import { IconButton } from "./button";
import { Icon } from "./icon";

const LOCALE_NAMES: Record<Locale, string> = { it: "Italiano", en: "English" };

/** One button that switches to the other language, showing the current one. */
function LanguageToggle() {
  const locale = useLocale();
  const next = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length];
  const label = `${t("header.language")}: ${LOCALE_NAMES[locale]}`;

  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 items-center gap-1 rounded-md px-2.5 text-14 font-bold tracking-wide text-muted",
        "transition-[background-color,color] hover:bg-surface-muted hover:text-foreground",
      )}
      aria-label={label}
      title={label}
      onClick={() => setLocale(next)}
    >
      <Icon name="globe-02" className="text-18 max-3xs:hidden" />
      <span lang={locale}>{locale.toUpperCase()}</span>
    </button>
  );
}

// The same filled 24px glyphs as before the system option (Material light_mode,
// dark_mode, desktop_windows).
const THEME_OPTIONS = {
  light: {
    label: "header.themeLight",
    path: "M12 9c1.65 0 3 1.35 3 3s-1.35 3-3 3-3-1.35-3-3 1.35-3 3-3m0-2c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z",
  },
  dark: {
    label: "header.themeDark",
    path: "M9.37 5.51A7.35 7.35 0 0 0 9.1 7.5c0 4.08 3.32 7.4 7.4 7.4.68 0 1.35-.09 1.99-.27A7.014 7.014 0 0 1 12 19c-3.86 0-7-3.14-7-7 0-2.93 1.81-5.45 4.37-6.49zM12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z",
  },
  system: {
    label: "header.themeSystem",
    path: "M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h6v2H8v2h8v-2h-2v-2h6c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H4V4h16v12z",
  },
};

/** Light, dark and system side by side, the current choice highlighted. */
function ThemeToggle() {
  useLocale();
  const preference = useThemePreference();

  return (
    <div
      className="inline-flex rounded-full border border-border bg-surface-muted p-[3px]"
      role="group"
      aria-label={t("header.theme")}
    >
      {THEME_PREFERENCES.map((option) => (
        <button
          key={option}
          type="button"
          className={cn(
            "grid h-7 w-[34px] place-items-center rounded-full text-muted",
            "transition-[background-color,color] hover:text-foreground",
            "aria-pressed:bg-surface aria-pressed:text-accent-strong aria-pressed:shadow-sm",
          )}
          aria-pressed={option === preference}
          aria-label={t(THEME_OPTIONS[option].label)}
          title={t(THEME_OPTIONS[option].label)}
          onClick={() => setThemePreference(option)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d={THEME_OPTIONS[option].path} />
          </svg>
        </button>
      ))}
    </div>
  );
}

export function Header({ page }: { page: "home" | "classroom" | "info" }) {
  useLocale();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-header max-w-content items-center gap-3 px-gutter max-xs:gap-2">
        <a
          className="flex min-w-0 items-center gap-2.5 text-foreground no-underline"
          href="./"
          aria-label={t("header.home")}
          onClick={(event) => {
            event.preventDefault();
            closePage();
          }}
        >
          <img
            className="size-10 flex-none"
            src="/brand/logo-40.png"
            srcSet="/brand/logo-40.png 1x, /brand/logo-80.png 2x, /brand/logo-120.png 3x"
            alt=""
            width="40"
            height="40"
          />
          <span className="text-17 font-bold tracking-tight max-xs:hidden">PoliNetwork</span>
          {/* Phones drop "PoliNetwork" and set the product name in its style. */}
          <span className="text-17 text-muted max-xs:font-bold max-xs:text-foreground">
            {t("app.name")}
          </span>
        </a>

        <div className="ml-auto flex min-w-0 items-center gap-1">
          <ThemeToggle />
          <LanguageToggle />
          <IconButton
            aria-label={t("header.info")}
            title={t("header.info")}
            aria-current={page === "info" ? "page" : undefined}
            onClick={() => (page === "info" ? leavePage() : openInApp("/info"))}
          >
            <Icon name="information-circle" />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
