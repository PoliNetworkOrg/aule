import { Settings } from "./app/components/settings-host";
import { loadApplication } from "./lib/application";
import { useEffect } from "react";

export function AppShell() {
  useEffect(() => {
    void loadApplication();
  }, []);

  return (
    <>
      <Settings />
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
                <h4 className="secondary" id="env-badge" hidden>
                  Beta
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
            >
              <i className="hgi-stroke hgi-star" aria-hidden="true"></i>
            </button>

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
                <span data-i18n="favourites.title">Favourites</span>
              </h3>
            </div>
            <div id="favourites-carousel" className="favourites-carousel" hidden></div>
            <p
              id="favourites-empty"
              className="favourites-empty secondary"
              data-i18n="favourites.empty"
            >
              Star a classroom to pin it here.
            </p>
          </div>

          <div className="section-header">
            <h3 className="section-header-title">
              <i
                className="hgi-stroke hgi-calendar-03 section-header-title-icon"
                aria-hidden="true"
              ></i>
              <span data-i18n="available.title">Available Classrooms</span>
            </h3>
          </div>

          <form id="available-classrooms-form" className="form" data-loading="">
            <div className="picker-row">
              <campus-chip-picker data-loading="">
                <input type="hidden" id="campus-picker" name="campus" />
              </campus-chip-picker>

              <div className="picker-substack">
                <date-chip-picker data-loading="">
                  <div className="date-picker">
                    <select id="date-picker" name="date" hidden></select>

                    <div
                      id="today-indicator"
                      className="hidden"
                      aria-hidden="true"
                      data-i18n="datepicker.today"
                    >
                      Today
                    </div>
                    <div className="date-picker-container"></div>
                    <div className="date-indicator"></div>
                  </div>
                </date-chip-picker>

                <time-range-chip-picker data-loading="">
                  <div className="time-pickers-container">
                    <div className="time-picker">
                      <input
                        type="time"
                        id="from-time-picker"
                        name="from"
                        min="07:15"
                        max="20:15"
                      />
                    </div>

                    <div className="time-picker">
                      <input type="time" id="to-time-picker" name="to" min="07:15" max="20:15" />
                    </div>
                  </div>
                </time-range-chip-picker>
              </div>
            </div>
          </form>

          <div id="available-classrooms-results" className="available-classrooms-container empty">
            <i className="hgi-stroke hgi-search-01 empty-container-icon" aria-hidden="true"></i>
            <p className="empty-container-title" data-i18n="results.emptyTitle">
              Need a classroom?
            </p>
            <p className="empty-container-subtitle" data-i18n="results.emptySubtitle">
              Tell me when you need it and I’ll show you what’s available
            </p>
          </div>
        </div>

        <div id="search-classrooms-container" className="tab-content"></div>

        <div id="classroom-detail-overlay" hidden></div>

        <div id="info-page-overlay" hidden></div>
      </div>

      <footer className="footer">
        <button
          className="transparent-button version-info-button"
          data-popover="version-info-popover"
        >
          <label className="secondary" data-i18n="footer.versionInfo"></label>
        </button>
        <div id="version-info-popover" className="popover liquid-glass">
          <div className="arrow" data-arrow=""></div>

          <img src="/favicons/main/logo.webp" className="changelog-logo" width="434" height="500" />
          <h1 className="popover-title" data-i18n="footer.versionInfo"></h1>
          <div className="changelog-container">
            <h2 className="popover-subtitle" data-i18n="footer.whatsNew">
              What's new?
            </h2>

            <ul>
              <li data-i18n="changelog.item1"></li>
              <li data-i18n="changelog.item2"></li>
              <li data-i18n="changelog.item3"></li>
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
              <span className="hero-text" data-i18n="footer.checkOnGitHub">
                Check on GitHub
              </span>
            </a>
          </div>
        </div>

        <label className="secondary info-label">
          <strong>
            <span data-i18n="footer.disclaimer5">Not affiliated with Politecnico di Milano.</span>
          </strong>
        </label>
      </footer>

      <div
        id="data-fetch-indicator-popover-container"
        className="data-fetch-popover-container"
      ></div>

      <div id="search-overlay" className="search-overlay-backdrop" hidden>
        <div
          className="search-overlay-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Search classrooms"
        >
          <div className="search-overlay-header">
            <div className="search-bar-wrapper liquid-glass">
              <i className="hgi-stroke hgi-search-01" aria-hidden="true"></i>
              <input
                type="text"
                id="classroom-search-input"
                className="search-input"
                data-i18n-attr="placeholder:search.inputPlaceholder"
                placeholder="e.g. 2.0.1, Trifoglio..."
                autoComplete="off"
                spellCheck="false"
              />
              <button
                id="classroom-search-clear"
                className="search-clear-btn"
                type="button"
                tabIndex={-1}
                aria-label="Clear search"
              >
                <i className="hgi-stroke hgi-cancel-01" aria-hidden="true"></i>
              </button>
            </div>
            <button
              id="search-overlay-close"
              className="search-overlay-close liquid-glass"
              type="button"
              aria-label="Close search"
            >
              <i className="hgi-stroke hgi-cancel-01" aria-hidden="true"></i>
            </button>
          </div>
          <div id="search-overlay-results" className="search-overlay-results"></div>
        </div>
      </div>

      <div className="bn-wrapper" id="bn-wrapper">
        <div className="bn-group" id="bn-group">
          <nav className="bn-tabbar" id="bn-bar" aria-label="Main navigation">
            <div className="bn-tabbar-items" id="bn-bar-items"></div>
          </nav>
          <div className="bn-pill-outer" id="bn-pill" aria-hidden="true">
            <div className="bn-pill-inner">
              <div className="bn-active-row" id="bn-active-row"></div>
            </div>
          </div>
          <div className="bn-pill-hit" id="bn-pill-hit"></div>
        </div>

        <button
          className="bn-search-btn liquid-glass"
          id="bn-search-btn"
          type="button"
          aria-label="Search"
        >
          <span className="bn-search-btn-inner">
            <i className="hgi-stroke hgi-search-01"></i>
            <span className="bn-tab-label" data-i18n="tabs.search">
              Search
            </span>
          </span>
        </button>
      </div>
    </>
  );
}
