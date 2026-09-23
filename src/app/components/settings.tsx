import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefCallback,
  type RefObject,
} from "react";
import { mountSettings } from "./settings-host";
import {
  t,
  getLocale,
  getTranslationVersion,
  setLocale,
  onTranslationChange,
  animateI18nElement,
} from "../i18n";
import { classroomsData } from "../available-rooms-script";
import { STORAGE_KEY as TIME_FORMAT_KEY } from "../utils/time-format";
import { IS_STABLE_BUILD, USE_BETA_BACKEND_KEY } from "../config";
import { getBlurMode, setBlurMode, reevaluateBlurCapability, applyBlurState } from "vitrium";
import { Toggle, type PillControl } from "./toggle";
import { SegmentedControl } from "./segmented-control";
import { bindSettingsMotion } from "./settings-motion";
import {
  PREFERRED_CAMPUS_ENABLED_KEY,
  PREFERRED_CAMPUS_ID_KEY,
  REMEMBER_LAST_CAMPUS_KEY,
  LAST_CAMPUS_ID_KEY,
  HIDE_SUNDAYS_KEY,
  SHOW_PARTIAL_KEY,
  INTERVAL_HOURS_KEY,
  DEFAULT_TAB_KEY,
  AUTO_SEARCH_KEY,
  LIVE_SEARCH_KEY,
} from "./settings-preferences";

export {
  getStartupTabId,
  applyPreferredCampusIfEnabled,
  applyRememberLastCampusIfEnabled,
  SHOW_PARTIAL_KEY,
  INTERVAL_HOURS_KEY,
  DEFAULT_TAB_KEY,
  LAST_TAB_KEY,
  AUTO_SEARCH_KEY,
  LIVE_SEARCH_KEY,
} from "./settings-preferences";

let toggle: (() => void) | undefined;

export function initSettings() {
  mountSettings(<SettingsPopup />);
}

export function toggleSettings() {
  toggle?.();
}

function storedToggle(key: string, defaultValue = false) {
  const saved = localStorage.getItem(key);

  return saved === null ? defaultValue : saved === "true";
}

interface BadgeStyle extends CSSProperties {
  "--badge-color": string;
}

function badgeColor(color: string): BadgeStyle {
  return { "--badge-color": color };
}

function Warning({ visible, message }: { visible: boolean; message: string }) {
  return (
    <div className={`settings-warning${visible ? "" : " settings-warning--hidden"}`}>
      <i className="hgi-stroke hgi-alert-02 settings-warning__icon" aria-hidden="true" />
      <span className="settings-warning__text" data-i18n={message}>
        {t(message)}
      </span>
    </div>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  function change(next: number) {
    onChange(next);
  }

  return (
    <div className="settings-stepper">
      <button
        type="button"
        className="settings-stepper__btn"
        disabled={value <= 1}
        onClick={() => change(value - 1)}
      >
        <i className="hgi-stroke hgi-remove-01" aria-hidden="true" />
      </button>
      <span className="settings-stepper__value">{value}h</span>
      <button
        type="button"
        className="settings-stepper__btn"
        disabled={value >= 12}
        onClick={() => change(value + 1)}
      >
        <i className="hgi-stroke hgi-add-01" aria-hidden="true" />
      </button>
    </div>
  );
}

interface CampusSectionProps {
  refreshRef: RefObject<(() => void) | null>;
  register: RefCallback<PillControl>;
  translationVersion: number;
}

function CampusSection({ refreshRef, register, translationVersion }: CampusSectionProps) {
  const section = useRef<HTMLDivElement>(null);
  const [preferred, setPreferred] = useState(() => storedToggle(PREFERRED_CAMPUS_ENABLED_KEY));

  const [remember, setRemember] = useState(() => {
    if (
      localStorage.getItem(PREFERRED_CAMPUS_ENABLED_KEY) === null &&
      localStorage.getItem(REMEMBER_LAST_CAMPUS_KEY) === null
    ) {
      localStorage.setItem(REMEMBER_LAST_CAMPUS_KEY, "true");
      localStorage.setItem(LAST_CAMPUS_ID_KEY, "MIA01");
    }

    return storedToggle(REMEMBER_LAST_CAMPUS_KEY);
  });

  const [campuses, setCampuses] = useState(
    () => classroomsData[0]?.campuses.filter((campus) => campus.buildings.length > 0) ?? [],
  );

  const [campusId, setCampusId] = useState(
    () => localStorage.getItem(PREFERRED_CAMPUS_ID_KEY) ?? "",
  );

  useLayoutEffect(() => {
    refreshRef.current = () => {
      if (preferred) {
        setCampuses(
          classroomsData[0]?.campuses.filter((campus) => campus.buildings.length > 0) ?? [],
        );
        setCampusId(localStorage.getItem(PREFERRED_CAMPUS_ID_KEY) ?? "");
      }
    };

    return () => {
      refreshRef.current = null;
    };
  }, [preferred, refreshRef]);
  useLayoutEffect(() => {
    function saveCampus(event: Event) {
      if (remember && event instanceof CustomEvent) {
        // campus-picker dispatches a campuschange event with the selected campus ID.
        const detail: { id: string } = event.detail;
        localStorage.setItem(LAST_CAMPUS_ID_KEY, detail.id);
      }
    }

    document.addEventListener("campuschange", saveCampus);

    return () => document.removeEventListener("campuschange", saveCampus);
  }, [remember]);
  useLayoutEffect(() => {
    section.current
      ?.querySelectorAll<HTMLElement>(
        "[data-campus-label], [data-preferred-label], [data-preferred-sublabel], [data-rememberlast-label], [data-rememberlast-sublabel]",
      )
      .forEach(animateI18nElement);
  }, [translationVersion]);

  function changePreferred(value: boolean) {
    setPreferred(value);
    localStorage.setItem(PREFERRED_CAMPUS_ENABLED_KEY, String(value));

    if (value) {
      if (remember) {
        setRemember(false);
        localStorage.setItem(REMEMBER_LAST_CAMPUS_KEY, "false");
      }

      setCampuses(
        classroomsData[0]?.campuses.filter((campus) => campus.buildings.length > 0) ?? [],
      );
      setCampusId(localStorage.getItem(PREFERRED_CAMPUS_ID_KEY) ?? "");
    }
  }

  function changeRemember(value: boolean) {
    setRemember(value);
    localStorage.setItem(REMEMBER_LAST_CAMPUS_KEY, String(value));

    if (value && preferred) {
      setPreferred(false);
      localStorage.setItem(PREFERRED_CAMPUS_ENABLED_KEY, "false");
    }
  }

  const selectedCampus = campuses.some((campus) => campus.id === campusId)
    ? campusId
    : (campuses[0]?.id ?? "");

  return (
    <div ref={section} className="settings-section">
      <div className="settings-section__header">
        <div className="settings-section__icon-badge">
          <i className="hgi-stroke hgi-location-01" aria-hidden="true" />
        </div>
        <span className="settings-section__header-label" data-campus-label="">
          {t("settings.sectionCampus")}
        </span>
      </div>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row__icon-title-container">
            <div className="settings-row__icon-badge" style={badgeColor("#FF9500")}>
              <i className="hgi-stroke hgi-school-01" aria-hidden="true" />
            </div>
            <div className="settings-row__label-group">
              <span className="settings-row__label" data-preferred-label="">
                {t("settings.preferredCampus")}
              </span>
              <span className="settings-row__sublabel" data-preferred-sublabel="">
                {t("settings.preferredCampusDesc")}
              </span>
            </div>
          </div>
          <Toggle ref={register} value={preferred} onChange={changePreferred} />
        </div>
        {preferred && (
          <div className="settings-row settings-row--campus-picker">
            <select
              className="settings-campus-select"
              disabled={!campuses.length}
              value={selectedCampus}
              onChange={(event) => {
                setCampusId(event.target.value);
                localStorage.setItem(PREFERRED_CAMPUS_ID_KEY, event.target.value);
              }}
            >
              {campuses.length ? (
                campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))
              ) : (
                <option value="">{t("settings.noCampusData")}</option>
              )}
            </select>
          </div>
        )}
        <div className="settings-row">
          <div className="settings-row__icon-title-container">
            <div className="settings-row__icon-badge" style={badgeColor("#34C759")}>
              <i className="hgi-stroke hgi-history" aria-hidden="true" />
            </div>
            <div className="settings-row__label-group">
              <span className="settings-row__label" data-rememberlast-label="">
                {t("settings.rememberLastCampus")}
              </span>
              <span className="settings-row__sublabel" data-rememberlast-sublabel="">
                {t("settings.rememberLastCampusDesc")}
              </span>
            </div>
          </div>
          <Toggle ref={register} value={remember} onChange={changeRemember} />
        </div>
      </div>
    </div>
  );
}

function SettingsPopup() {
  const popup = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const refreshCampus = useRef<(() => void) | null>(null);
  const controls = useRef(new Set<PillControl>());
  const translationVersion = useSyncExternalStore(onTranslationChange, getTranslationVersion);
  const previousTranslation = useRef(translationVersion);
  const locale = getLocale();
  const [language, setLanguage] = useState(locale);

  const [timeFormat, setTimeFormat] = useState(
    () => localStorage.getItem(TIME_FORMAT_KEY) ?? "system",
  );

  const [defaultTab, setDefaultTab] = useState(
    () => localStorage.getItem(DEFAULT_TAB_KEY) ?? "available",
  );

  const [blurMode, updateBlurMode] = useState(getBlurMode);
  const [hideSundays, setHideSundays] = useState(() => storedToggle(HIDE_SUNDAYS_KEY));

  const [intervalHours, setIntervalHours] = useState(() =>
    Math.max(1, Math.min(12, parseInt(localStorage.getItem(INTERVAL_HOURS_KEY) ?? "", 10) || 2)),
  );

  const [showPartial, setShowPartial] = useState(() => storedToggle(SHOW_PARTIAL_KEY, true));
  const [autoSearch, setAutoSearch] = useState(() => storedToggle(AUTO_SEARCH_KEY, true));
  const [liveSearch, setLiveSearch] = useState(() => storedToggle(LIVE_SEARCH_KEY, true));
  const [betaBackend, setBetaBackend] = useState(() => storedToggle(USE_BETA_BACKEND_KEY, true));

  const register = useCallback((control: PillControl | null) => {
    if (!control) return;
    controls.current.add(control);

    return () => {
      controls.current.delete(control);
    };
  }, []);

  useLayoutEffect(() => {
    const trigger = document.getElementById("settings-btn");

    if (!popup.current || !overlay.current || !trigger) return;

    const motion = bindSettingsMotion(popup.current, trigger, overlay.current, () => {
      // The results list's "partial" filter button (available-results.tsx)
      // writes SHOW_PARTIAL_KEY directly to localStorage without going
      // through this popup, which only reads it once on mount — resync here
      // on every open so the two stay in agreement.
      setShowPartial(storedToggle(SHOW_PARTIAL_KEY, true));
      controls.current.forEach((control) => control.refresh({ snap: true }));
      refreshCampus.current?.();
    });

    toggle = motion.toggle;

    return () => {
      toggle = undefined;
      motion.destroy();
    };
  }, []);
  useLayoutEffect(() => {
    if (translationVersion === previousTranslation.current) return;
    previousTranslation.current = translationVersion;
    setLanguage(locale);
    popup.current
      ?.querySelectorAll<HTMLElement>(
        "[data-i18n], .settings-popup__title, .settings-section__header-label",
      )
      .forEach(animateI18nElement);
    controls.current.forEach((control) => control.refresh({ snap: true }));
  }, [translationVersion, locale]);

  function changeLanguage(value: string) {
    // The control is moved optimistically so it tracks the tap immediately;
    // if the locale JSON can't be loaded, setLocale() keeps the previous
    // locale active, so put the control back rather than leaving it showing
    // a language the app isn't actually using.
    setLanguage(value);

    if (value === getLocale()) return;
    void setLocale(value).then((ok) => {
      if (!ok) setLanguage(getLocale());
    });
  }

  function changeTimeFormat(value: string) {
    setTimeFormat(value);
    localStorage.setItem(TIME_FORMAT_KEY, value);
    window.dispatchEvent(new CustomEvent("timeformatchange"));
  }

  function changeBlurMode(value: string) {
    updateBlurMode(value);
    setBlurMode(value);

    if (value === "off") applyBlurState(false);
    else if (value === "on") applyBlurState(true);
    else void reevaluateBlurCapability();
  }

  function changeHideSundays(value: boolean) {
    setHideSundays(value);
    localStorage.setItem(HIDE_SUNDAYS_KEY, String(value));
    window.dispatchEvent(new CustomEvent("hidesundayschange", { detail: { hidden: value } }));
  }

  const languageOptions = [
    {
      value: "en",
      label: (
        <>
          <span className="settings-lang-btn__flag">🇬🇧</span>
          <span className="settings-lang-btn__name">English</span>
        </>
      ),
    },
    {
      value: "it",
      label: (
        <>
          <span className="settings-lang-btn__flag">🇮🇹</span>
          <span className="settings-lang-btn__name">Italiano</span>
        </>
      ),
    },
  ];

  const timeOptions = ["system", "12", "24"].map((value) => {
    const key = `settings.timeFormat.${value === "system" ? value : `${value}h`}`;

    return {
      value,
      label: (
        <span className="settings-lang-btn__name" data-i18n={key}>
          {t(key)}
        </span>
      ),
    };
  });

  const tabOptions = [
    { value: "available", icon: "hgi-calendar-check-01" },
    { value: "search", icon: "hgi-search-01" },
    { value: "last", icon: "hgi-history" },
  ].map(({ value, icon }) => ({
    value,
    separator: value === "last",
    label: (
      <>
        <i className={`hgi-stroke ${icon} settings-seg-icon`} aria-hidden="true" />
        <span className="settings-lang-btn__name" data-i18n={`settings.defaultTab.${value}`}>
          {t(`settings.defaultTab.${value}`)}
        </span>
      </>
    ),
  }));

  const blurOptions = ["auto", "on", "off"].map((value) => ({
    value,
    label: (
      <span className="settings-lang-btn__name" data-i18n={`settings.glassEffect.${value}`}>
        {t(`settings.glassEffect.${value}`)}
      </span>
    ),
  }));

  return (
    <>
      <div ref={popup} className="settings-popup" style={{ display: "none" }} data-react-owned="">
        <div className="settings-popup__clip">
          <div className="settings-popup__inner">
            <div className="settings-popup__title-row">
              <h2 className="settings-popup__title">{t("settings.title")}</h2>
              <button className="settings-close-btn" aria-label="Close settings">
                <i className="hgi-stroke hgi-cancel-01" aria-hidden="true"></i>
              </button>
            </div>

            <div className="settings-section">
              <div className="settings-section__header">
                <div className="settings-section__icon-badge">
                  <i className="hgi-stroke hgi-translate" aria-hidden="true"></i>
                </div>
                <span className="settings-section__header-label">{t("settings.language")}</span>
              </div>
              <div className="settings-group">
                <div className="settings-row">
                  <div className="settings-row__icon-title-container">
                    <div className="settings-row__icon-badge" style={badgeColor("#007AFF")}>
                      <i className="hgi-stroke hgi-languages" aria-hidden="true"></i>
                    </div>
                    <div className="settings-row__label-group">
                      <span className="settings-row__label" data-i18n="settings.language">
                        {t("settings.language")}
                      </span>
                      <span className="settings-row__sublabel" data-i18n="settings.languageDesc">
                        {t("settings.languageDesc")}
                      </span>
                    </div>
                  </div>
                  <SegmentedControl
                    ref={register}
                    data-lang-toggle=""
                    value={language}
                    onSelect={changeLanguage}
                    options={languageOptions}
                  />
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section__header">
                <div className="settings-section__icon-badge">
                  <i className="hgi-stroke hgi-calendar-03" aria-hidden="true"></i>
                </div>
                <span className="settings-section__header-label" data-timefmt-section-header="">
                  {t("settings.sectionDateTime")}
                </span>
              </div>
              <div className="settings-group">
                <div className="settings-row">
                  <div className="settings-row__icon-title-container">
                    <div className="settings-row__icon-badge" style={badgeColor("#FF9500")}>
                      <i className="hgi-stroke hgi-clock-01" aria-hidden="true"></i>
                    </div>
                    <div className="settings-row__label-group">
                      <span className="settings-row__label" data-i18n="settings.timeFormat">
                        {t("settings.timeFormat")}
                      </span>
                      <span className="settings-row__sublabel" data-i18n="settings.timeFormatDesc">
                        {t("settings.timeFormatDesc")}
                      </span>
                    </div>
                  </div>
                  <SegmentedControl
                    ref={register}
                    data-timefmt-toggle=""
                    value={timeFormat}
                    onSelect={changeTimeFormat}
                    options={timeOptions}
                  />
                </div>
                <div className="settings-row" data-hide-sundays-row="">
                  <div className="settings-row__icon-title-container">
                    <div className="settings-row__icon-badge" style={badgeColor("#FF3B30")}>
                      <i className="hgi-stroke hgi-calendar-remove-01" aria-hidden="true"></i>
                    </div>
                    <div className="settings-row__label-group">
                      <span className="settings-row__label" data-i18n="settings.hideSundays">
                        {t("settings.hideSundays")}
                      </span>
                      <span className="settings-row__sublabel" data-i18n="settings.hideSundaysDesc">
                        {t("settings.hideSundaysDesc")}
                      </span>
                    </div>
                  </div>
                  <Toggle ref={register} value={hideSundays} onChange={changeHideSundays} />
                </div>
                <div className="settings-row" data-interval-hours-row="">
                  <div className="settings-row__icon-title-container">
                    <div className="settings-row__icon-badge" style={badgeColor("#007AFF")}>
                      <i className="hgi-stroke hgi-hourglass" aria-hidden="true"></i>
                    </div>
                    <div className="settings-row__label-group">
                      <span className="settings-row__label" data-i18n="settings.intervalHours">
                        {t("settings.intervalHours")}
                      </span>
                      <span
                        className="settings-row__sublabel"
                        data-i18n="settings.intervalHoursDesc"
                      >
                        {t("settings.intervalHoursDesc")}
                      </span>
                    </div>
                  </div>
                  <Stepper
                    value={intervalHours}
                    onChange={(value) => {
                      setIntervalHours(value);
                      localStorage.setItem(INTERVAL_HOURS_KEY, String(value));
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section__header">
                <div className="settings-section__icon-badge">
                  <i className="hgi-stroke hgi-search-01" aria-hidden="true"></i>
                </div>
                <span
                  className="settings-section__header-label"
                  data-i18n="settings.sectionResults"
                >
                  {t("settings.sectionResults")}
                </span>
              </div>
              <div className="settings-group">
                <div className="settings-row" data-show-partial-row="">
                  <div className="settings-row__icon-title-container">
                    <div className="settings-row__icon-badge" style={badgeColor("#34C759")}>
                      <i className="hgi-stroke hgi-filter" aria-hidden="true"></i>
                    </div>
                    <div className="settings-row__label-group">
                      <span className="settings-row__label" data-i18n="settings.showPartial">
                        {t("settings.showPartial")}
                      </span>
                      <span className="settings-row__sublabel" data-i18n="settings.showPartialDesc">
                        {t("settings.showPartialDesc")}
                      </span>
                    </div>
                  </div>
                  <Toggle
                    ref={register}
                    value={showPartial}
                    onChange={(value) => {
                      setShowPartial(value);
                      localStorage.setItem(SHOW_PARTIAL_KEY, String(value));
                    }}
                  />
                </div>
                <div className="settings-row" data-auto-search-row="">
                  <div className="settings-row__icon-title-container">
                    <div className="settings-row__icon-badge" style={badgeColor("#007AFF")}>
                      <i className="hgi-stroke hgi-bolt" aria-hidden="true"></i>
                    </div>
                    <div className="settings-row__label-group">
                      <span className="settings-row__label" data-i18n="settings.autoSearch">
                        {t("settings.autoSearch")}
                      </span>
                      <span className="settings-row__sublabel" data-i18n="settings.autoSearchDesc">
                        {t("settings.autoSearchDesc")}
                      </span>
                    </div>
                  </div>
                  <Toggle
                    ref={register}
                    value={autoSearch}
                    onChange={(value) => {
                      setAutoSearch(value);
                      localStorage.setItem(AUTO_SEARCH_KEY, String(value));
                    }}
                  />
                </div>
                <Warning visible={autoSearch} message="settings.autoSearchWarning" />
                <div className="settings-row" data-live-search-row="">
                  <div className="settings-row__icon-title-container">
                    <div className="settings-row__icon-badge" style={badgeColor("#FF2D55")}>
                      <i className="hgi-stroke hgi-refresh-ccw" aria-hidden="true"></i>
                    </div>
                    <div className="settings-row__label-group">
                      <span className="settings-row__label" data-i18n="settings.liveSearch">
                        {t("settings.liveSearch")}
                      </span>
                      <span className="settings-row__sublabel" data-i18n="settings.liveSearchDesc">
                        {t("settings.liveSearchDesc")}
                      </span>
                    </div>
                  </div>
                  <Toggle
                    ref={register}
                    value={liveSearch}
                    onChange={(value) => {
                      setLiveSearch(value);
                      localStorage.setItem(LIVE_SEARCH_KEY, String(value));
                    }}
                  />
                </div>
                <Warning visible={liveSearch} message="settings.liveSearchWarning" />
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section__header">
                <div className="settings-section__icon-badge">
                  <i className="hgi-stroke hgi-browser" aria-hidden="true"></i>
                </div>
                <span className="settings-section__header-label" data-defaulttab-section-header="">
                  {t("settings.sectionNavigation")}
                </span>
              </div>
              <div className="settings-group">
                <div className="settings-row">
                  <div className="settings-row__icon-title-container">
                    <div className="settings-row__icon-badge" style={badgeColor("#5856D6")}>
                      <i className="hgi-stroke hgi-browser" aria-hidden="true"></i>
                    </div>
                    <div className="settings-row__label-group">
                      <span className="settings-row__label" data-i18n="settings.defaultTab">
                        {t("settings.defaultTab")}
                      </span>
                      <span className="settings-row__sublabel" data-i18n="settings.defaultTab.desc">
                        {t("settings.defaultTab.desc")}
                      </span>
                    </div>
                  </div>
                  <SegmentedControl
                    ref={register}
                    data-defaulttab-toggle=""
                    value={defaultTab}
                    onSelect={(value) => {
                      setDefaultTab(value);
                      localStorage.setItem(DEFAULT_TAB_KEY, value);
                    }}
                    options={tabOptions}
                  />
                </div>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section__header">
                <div className="settings-section__icon-badge">
                  <i className="hgi-stroke hgi-blur" aria-hidden="true"></i>
                </div>
                <span className="settings-section__header-label" data-blurmode-section-header="">
                  {t("settings.sectionAppearance")}
                </span>
              </div>
              <div className="settings-group">
                <div className="settings-row">
                  <div className="settings-row__icon-title-container">
                    <div className="settings-row__icon-badge" style={badgeColor("#64D2FF")}>
                      <i className="hgi-stroke hgi-layers-01" aria-hidden="true"></i>
                    </div>
                    <div className="settings-row__label-group">
                      <span className="settings-row__label" data-i18n="settings.glassEffect">
                        {t("settings.glassEffect")}
                      </span>
                      <span className="settings-row__sublabel" data-i18n="settings.glassEffectDesc">
                        {t("settings.glassEffectDesc")}
                      </span>
                    </div>
                  </div>
                  <SegmentedControl
                    ref={register}
                    data-blurmode-toggle=""
                    value={blurMode}
                    onSelect={changeBlurMode}
                    options={blurOptions}
                  />
                </div>
              </div>
            </div>

            {!IS_STABLE_BUILD && (
              <>
                <div className="settings-section">
                  <div className="settings-section__header">
                    <div className="settings-section__icon-badge">
                      <i className="hgi-stroke hgi-server" aria-hidden="true"></i>
                    </div>
                    <span
                      className="settings-section__header-label"
                      data-i18n="settings.sectionBackend"
                    >
                      {t("settings.sectionBackend")}
                    </span>
                  </div>
                  <div className="settings-group">
                    <div className="settings-row" data-use-beta-backend-row="">
                      <div className="settings-row__icon-title-container">
                        <div className="settings-row__icon-badge" style={badgeColor("#5856D6")}>
                          <i className="hgi-stroke hgi-test-tube-01" aria-hidden="true"></i>
                        </div>
                        <div className="settings-row__label-group">
                          <span className="settings-row__label" data-i18n="settings.useBetaBackend">
                            {t("settings.useBetaBackend")}
                          </span>
                          <span
                            className="settings-row__sublabel"
                            data-i18n="settings.useBetaBackendDesc"
                          >
                            {t("settings.useBetaBackendDesc")}
                          </span>
                        </div>
                      </div>
                      <Toggle
                        ref={register}
                        value={betaBackend}
                        onChange={(value) => {
                          setBetaBackend(value);
                          localStorage.setItem(USE_BETA_BACKEND_KEY, String(value));
                        }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
            <CampusSection
              refreshRef={refreshCampus}
              register={register}
              translationVersion={translationVersion}
            />
          </div>
        </div>{" "}
      </div>
      <div ref={overlay} className="settings-overlay" hidden />
    </>
  );
}
