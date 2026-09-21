import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { getTranslationVersion, onTranslationChange } from "../i18n";
import type { Campus } from "../types";
import { CampusPickerController } from "./campus-picker-controller";

export interface CampusPickerElement extends HTMLElement {
  setup: (campuses: Campus[]) => void;
  selectCampusById: (id: string, animate?: boolean) => void;
  retranslate: () => void;
  setDocked: (docked: boolean) => void;
  destroy?: () => void;
}

function CampusPickerHost({ host }: { host: HTMLElement }) {
  const language = useSyncExternalStore(onTranslationChange, getTranslationVersion);
  const controller = useRef<CampusPickerController | null>(null);

  useLayoutEffect(() => {
    const picker = new CampusPickerController(host);

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
  }, [host]);
  useLayoutEffect(() => {
    controller.current?.retranslate();
  }, [language]);

  return null;
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

export function CampusSheetPicker() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  return (
    <campus-sheet-picker ref={setHost}>
      <input type="hidden" />
      {host && <CampusPickerHost host={host} />}
    </campus-sheet-picker>
  );
}

export function setupCampusPicker(campuses: Campus[]) {
  document.querySelector<CampusPickerElement>("campus-chip-picker")?.setup(campuses);
}

export function selectCampusById(id: string, animate = true) {
  document.querySelector<CampusPickerElement>("campus-chip-picker")?.selectCampusById(id, animate);
}
