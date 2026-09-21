import { AvailableResults } from "./app/components/available-results";
import { CampusMap } from "./app/components/campus-map";
import { CampusSheet } from "./app/components/campus-sheet";
import { DataFetchCard } from "./app/components/data-fetch-card";
import { SearchOverlay } from "./app/components/search-overlay";
import { Favourites } from "./app/components/favourites";
import { BottomNavigation } from "./app/components/bottom-nav";
import { KeyboardShortcuts } from "./app/components/keybindings";
import { Tooltip } from "./app/components/tooltip";
import { CampusPicker } from "./app/components/campus-picker";
import { TimeRangeChipPicker } from "./app/components/time-range-chip-picker";
import { DateChipPicker } from "./app/components/date-chip-picker";
import { Settings } from "./app/components/settings-host";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { getTranslationVersion, onTranslationChange, t, animateI18nElement } from "./app/i18n";
import { RichText } from "./app/components/rich-text";
import { IS_STABLE_BUILD } from "./app/config";

export function AppShell() {
  const translationVersion = useSyncExternalStore(onTranslationChange, getTranslationVersion);
  const previousTranslation = useRef(translationVersion);
  useLayoutEffect(() => {
    if (previousTranslation.current > 0 && previousTranslation.current !== translationVersion)
      document.querySelectorAll<HTMLElement>("[data-shell-i18n]").forEach(animateI18nElement);
    previousTranslation.current = translationVersion;
  }, [translationVersion]);
  const hostname = location.hostname;

  const envLabel =
    hostname === "beta.poliaule.com"
      ? "Beta"
      : hostname === "dev.poliaule.com"
        ? "Dev"
        : IS_STABLE_BUILD
          ? null
          : "Local";

  return (
    <>
      <Settings />
      <KeyboardShortcuts />
      <Tooltip />
      <div className="header-top-strip" aria-hidden="true"></div>
      <header className="header">
        <div className="header-top-line-container">
          <div className="header-blur-layers" aria-hidden="true">
            <div className="header-blur-layer"></div>
            <div className="header-blur-layer"></div>
            <div className="header-blur-layer"></div>
            <div className="header-blur-layer"></div>
            <div className="header-fade-overlay"></div>
          </div>

          <div className="header-title-container">
            <button className="header-title-btn" id="info-trigger" aria-label="About PoliAule">
              <img
                src="/favicons/main/logo.webp"
                className="header-logo"
                width="434"
                height="500"
              />

              <div className="header-title-beta-container splash-header-item">
                <h2 className="header-title">PoliAule</h2>
                <h4 className="secondary" id="env-badge" hidden={!envLabel}>
                  {envLabel ?? "Beta"}
                </h4>
              </div>
            </button>
          </div>

          <div className="header-buttons-container splash-header-item">
            <button
              id="favourite-btn"
              className="header-button liquid-glass"
              hidden
              aria-label="Add to favourites"
            />

            <button
              id="data-fetch-btn"
              className="header-button liquid-glass"
              aria-label="Data status"
            >
              <div id="data-fetch-indicator" className="pulse-indicator"></div>
            </button>

            <button id="settings-btn" className="header-button liquid-glass" aria-label="Settings">
              <i className="hgi-stroke hgi-settings-01" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        <div className="header-nav-row"></div>
      </header>

      <button
        id="detail-back-btn"
        className="detail-back-btn liquid-glass"
        hidden
        aria-label="Back"
      >
        <i className="hgi-stroke hgi-chevron-left" aria-hidden="true"></i>
      </button>

      <div className="body-container">
        <div id="available-classrooms-container" className="tab-content visible">
          <div className="favourites-section">
            <div className="section-header">
              <h3 className="section-header-title">
                <i className="hgi-stroke hgi-star section-header-title-icon" aria-hidden="true"></i>
                <span data-shell-i18n="" data-i18n="favourites.title">
                  <RichText text={t("favourites.title")} />
                </span>
              </h3>
            </div>
            <Favourites />
          </div>

          <div className="section-header">
            <h3 className="section-header-title">
              <i
                className="hgi-stroke hgi-calendar-03 section-header-title-icon"
                aria-hidden="true"
              ></i>
              <span data-shell-i18n="" data-i18n="available.title">
                <RichText text={t("available.title")} />
              </span>
            </h3>
          </div>

          <form id="available-classrooms-form" className="form" data-loading="">
            <div className="picker-row">
              <CampusPicker />

              <div className="picker-substack">
                <DateChipPicker />

                <TimeRangeChipPicker />
              </div>
            </div>
          </form>

          <AvailableResults />
        </div>

        <div id="search-classrooms-container" className="tab-content">
          <CampusSheet />
          <CampusMap />
        </div>

        <div id="classroom-detail-overlay" hidden></div>

        <div id="info-page-overlay" hidden></div>
      </div>

      <footer className="footer">
        <button className="transparent-button version-info-button">
          <label className="secondary" data-shell-i18n="" data-i18n="footer.versionInfo">
            <RichText text={t("footer.versionInfo")} />
          </label>
        </button>
        <div id="version-info-content" hidden>
          <img src="/favicons/main/logo.webp" className="changelog-logo" width="434" height="500" />
          <h1 className="popover-title" data-shell-i18n="" data-i18n="footer.versionInfo">
            <RichText text={t("footer.versionInfo")} />
          </h1>
          <div className="changelog-container">
            <h2 className="popover-subtitle" data-shell-i18n="" data-i18n="footer.whatsNew">
              <RichText text={t("footer.whatsNew")} />
            </h2>

            <ul>
              <li data-shell-i18n="" data-i18n="changelog.item1">
                <RichText text={t("changelog.item1")} />
              </li>
              <li data-shell-i18n="" data-i18n="changelog.item2">
                <RichText text={t("changelog.item2")} />
              </li>
              <li data-shell-i18n="" data-i18n="changelog.item3">
                <RichText text={t("changelog.item3")} />
              </li>
            </ul>

            <a
              href="https://github.com/SummaCristian/poliaule"
              target="_blank"
              className="hero-badge"
            >
              <svg className="hero-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 0.297c-6.627 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.387
                0.6 0.113 0.82-0.26 0.82-0.577 0-0.285-0.01-1.04-0.015-2.04
                -3.338 0.724-4.042-1.61-4.042-1.61-0.546-1.387-1.333-1.756-1.333-1.756
                -1.09-0.745 0.083-0.729 0.083-0.729 1.205 0.084 1.838 1.237 1.838 1.237
                1.07 1.834 2.807 1.304 3.492 0.997 0.108-0.775 0.418-1.304 0.762-1.604
                -2.665-0.303-5.467-1.334-5.467-5.932 0-1.31 0.468-2.38 1.236-3.22
                -0.124-0.303-0.536-1.523 0.117-3.176 0 0 1.008-0.322 3.3 1.23
                0.957-0.266 1.983-0.399 3.003-0.404 1.02 0.005 2.047 0.138 3.006 0.404
                2.289-1.552 3.295-1.23 3.295-1.23 0.655 1.653 0.243 2.873 0.12 3.176
                0.77 0.84 1.235 1.91 1.235 3.22 0 4.61-2.807 5.625-5.48 5.921
                0.43 0.37 0.823 1.096 0.823 2.21 0 1.595-0.015 2.877-0.015 3.267
                0 0.32 0.216 0.694 0.825 0.576C20.565 22.092 24 17.592 24 12.297
                24 5.67 18.627 0.297 12 0.297z"
                />
              </svg>
              <span className="hero-text" data-shell-i18n="" data-i18n="footer.checkOnGitHub">
                <RichText text={t("footer.checkOnGitHub")} />
              </span>
            </a>
          </div>
        </div>

        <label className="secondary info-label">
          <strong>
            <span data-shell-i18n="" data-i18n="footer.disclaimer5">
              <RichText text={t("footer.disclaimer5")} />
            </span>
          </strong>
        </label>
      </footer>

      <DataFetchCard />

      <SearchOverlay />

      <BottomNavigation />
    </>
  );
}
