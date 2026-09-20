import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { getTranslationVersion, onTranslationChange, t } from "../i18n";
import type { Campus } from "../types";
import { CampusPickerController } from "./campus-picker-controller";
import CAMPUS_PICKER_CSS_URL from "./campus-picker.css?url";

export interface CampusPickerElement extends HTMLElement {
  setup: (campuses: Campus[]) => void;
  selectCampusById: (id: string, animate?: boolean) => void;
  retranslate: () => void;
  setDocked: (docked: boolean) => void;
  destroy?: () => void;
}

function groupCampuses(campuses: Campus[]) {
  const byCity = new Map<string | undefined, Campus[]>();

  for (const campus of campuses) {
    if (!campus.buildings.length) continue;
    const list = byCity.get(campus.city) ?? [];
    list.push(campus);
    byCity.set(campus.city, list);
  }

  const sections: { label: string; i18n?: string; campuses: Campus[] }[] = [];
  const others: Campus[] = [];

  for (const [city, list] of byCity) {
    if (list.some((campus) => campus.group)) sections.push({ label: String(city), campuses: list });
    else others.push(...list);
  }

  if (others.length)
    sections.push({ label: t("campus.otherLabel"), i18n: "campus.otherLabel", campuses: others });

  return sections;
}

function Styles() {
  return (
    <>
      <link rel="stylesheet" href="/fonts/hugeicons/icons.css" />
      <link rel="stylesheet" href={CAMPUS_PICKER_CSS_URL} />
    </>
  );
}

function CampusPickerContent({
  host,
  shadow,
  panelHost,
}: {
  host: HTMLElement;
  shadow: ShadowRoot;
  panelHost: HTMLDivElement;
}) {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [value, setValue] = useState("");
  const [, setRevision] = useState(0);
  useSyncExternalStore(onTranslationChange, getTranslationVersion);
  const controller = useRef<CampusPickerController | null>(null);
  const sections = groupCampuses(campuses);
  useLayoutEffect(() => {
    const picker = new CampusPickerController(
      host,
      panelHost,
      setValue,
      (data) => {
        flushSync(() => setCampuses([...data]));
      },
      () => setRevision((revision) => revision + 1),
    );

    controller.current = picker;

    const integration = Object.assign(host, {
      setup: (data: Campus[]) => picker.setup(data),
      selectCampusById: (id: string, animate = true) => picker.selectCampusById(id, animate),
      retranslate: () => picker.retranslate(),
      setDocked: (docked: boolean) => picker.setDocked(docked),
    });

    return () => {
      picker.destroy();
      controller.current = null;
      integration.setup = () => {};

      integration.selectCampusById = () => {};

      integration.retranslate = () => {};

      integration.setDocked = () => {};
    };
  }, [host, panelHost]);

  return (
    <>
      {createPortal(
        <>
          <Styles />
          <select className="cp-native" tabIndex={-1} aria-hidden="true">
            {sections.map((section, index) => (
              <optgroup key={index} label={section.label} data-i18n={section.i18n}>
                {section.campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            className="campus-select"
            aria-haspopup="listbox"
            aria-expanded="false"
            aria-controls="cp-listbox"
          >
            <i className="hgi-stroke hgi-university campus-select__icon" aria-hidden="true" />
            <span className="campus-select__box">
              <span className="campus-select__label">{t("tabs.campus")}</span>
              <span className="campus-select__value">{value}</span>
            </span>
            <i className="hgi-stroke hgi-arrow-down-01 campus-select__chevron" aria-hidden="true" />
          </button>
          <div className="campus-select-skeleton" aria-hidden="true" />
        </>,
        shadow,
      )}
      {createPortal(
        <>
          <Styles />
          <div className="cp-overlay" hidden />
          <div
            id="cp-listbox"
            className="cp-popup"
            role="listbox"
            tabIndex={-1}
            aria-label="Campus"
          >
            <div className="cp-popup__inner">
              <div className="cp-popup__title" aria-hidden="true">
                <i className="hgi-stroke hgi-university cp-popup__title-icon" />
                <span className="cp-popup__title-text">{t("tabs.campus")}</span>
              </div>
              {sections.map((section, index) => (
                <div key={index} className="cp-section" data-i18n={section.i18n}>
                  <div className="cp-section-label">{section.label}</div>
                  {section.campuses.map((campus) => (
                    <div
                      key={campus.id}
                      className="campus-option"
                      role="option"
                      id={`cp-opt-${campus.id}`}
                      data-id={campus.id}
                      aria-selected="false"
                    >
                      <i
                        className="hgi-stroke hgi-tick-02 campus-option__check"
                        aria-hidden="true"
                      />
                      <span className="campus-option__text">
                        <span className="campus-option__name">{campus.name}</span>
                        {campus.group && (
                          <span className="campus-option__area">{campus.group}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>,
        panelHost.shadowRoot!,
      )}
    </>
  );
}

function CampusPickerHost({ host }: { host: HTMLElement }) {
  const [shadow] = useState(() => host.shadowRoot ?? host.attachShadow({ mode: "open" }));

  const [panelHost] = useState(() => {
    const element = document.createElement("div");
    element.className = "cp-panel-host";
    element.attachShadow({ mode: "open" });

    return element;
  });

  return shadow && <CampusPickerContent host={host} shadow={shadow} panelHost={panelHost} />;
}

export function CampusPicker() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  return (
    <campus-chip-picker ref={setHost} data-loading="">
      <input type="hidden" id="campus-picker" name="campus" />
      {host && <CampusPickerHost host={host} />}
    </campus-chip-picker>
  );
}

// The campus sheet still constructs its outer header. React owns this picker's
// contents while that view is migrated; dispose its root with the header.
export function createCampusSheetPicker() {
  const host = Object.assign(document.createElement("campus-sheet-picker"), {
    setup: (_campuses: Campus[]) => {},
    selectCampusById: (_id: string, _animate = true) => {},
    retranslate: () => {},
    setDocked: (_docked: boolean) => {},
  });

  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <>
        <input type="hidden" />
        <CampusPickerHost host={host} />
      </>,
    ),
  );

  return Object.assign(host, { destroy: () => root.unmount() });
}

export function setupCampusPicker(campuses: Campus[]) {
  document.querySelector<CampusPickerElement>("campus-chip-picker")?.setup(campuses);
}

export function selectCampusById(id: string, animate = true) {
  document.querySelector<CampusPickerElement>("campus-chip-picker")?.selectCampusById(id, animate);
}
