import { useLayoutEffect } from "react";
import { t } from "../i18n";
import { initSearchOverlay } from "./search-overlay-controller";

export { openSearchOverlay, closeSearchOverlay } from "./search-overlay-controller";

// The results themselves are owned entirely by search-overlay-controller.ts
// (see that file's header comment for why): React renders this static shell
// once and the controller mounts into #search-overlay-results.
export function SearchOverlay() {
  useLayoutEffect(() => initSearchOverlay(), []);

  return (
    <div id="search-overlay" className="search-overlay-backdrop" hidden>
      <div
        className="search-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Search classrooms"
      >
        <div className="search-overlay-header">
          <div className="search-bar-wrapper liquid-glass">
            <i className="hgi-stroke hgi-search-01 search-bar-icon" aria-hidden="true"></i>
            <input
              type="text"
              id="classroom-search-input"
              className="search-input"
              data-i18n-attr="placeholder:search.inputPlaceholder"
              placeholder={t("search.inputPlaceholder")}
              autoComplete="off"
              spellCheck="false"
            />
            <div className="search-bar-trailing">
              <button
                id="classroom-search-clear"
                className="search-clear-btn"
                type="button"
                tabIndex={-1}
                aria-label="Clear search"
              >
                <i className="hgi-stroke hgi-cancel-01" aria-hidden="true"></i>
              </button>
              <kbd className="search-kbd">esc</kbd>
            </div>
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
        <div className="search-results-frame">
          <div id="search-overlay-results" className="search-overlay-results" />
        </div>
      </div>
    </div>
  );
}
