import { createListPicker } from "vitrium";
import { t } from "../i18n.ts";
import type { Campus } from "../types";

type ListPicker = ReturnType<typeof createListPicker>;

// A single-select listbox: a Vitrium list picker (the pill that morphs into a
// list of campuses), plus what is PoliAule's: the campuses grouped by city, the
// `campuschange` event, a hidden <input name="campus"> mirroring the value for
// the form, and the docked desktop mode (picker-dock.ts).
//
// The submittable field stays a hidden <input> in the light DOM (rendered by
// campus-picker.tsx) so it is part of the <form>.
export class CampusPickerController {
  #host: HTMLElement;
  #picker: ListPicker;
  #hiddenInput: HTMLInputElement | null;
  #staticData: Campus[] | null = null;
  #ids = new Set<string>();
  #docked = false;
  #dockTimer = 0;
  #panelHome: HTMLElement | null = null; // the morph host the panel returns to when undocked
  #observer: MutationObserver;

  constructor(host: HTMLElement) {
    this.#host = host;
    this.#hiddenInput = host.querySelector<HTMLInputElement>('input[type="hidden"]');
    this.#picker = createListPicker({
      label: t("tabs.campus"),
      icon: '<i class="hgi-stroke hgi-university" aria-hidden="true"></i>',
      options: [],
      onChange: (id: string) => this.#changed(id),
    });
    this.#picker.setLoading(host.hasAttribute("data-loading"));
    host.appendChild(this.#picker.el);

    // The custom element has no lifecycle callbacks of its own here, so the
    // loading flag (cleared by the application once data is in) is observed.
    this.#observer = new MutationObserver(() =>
      this.#picker.setLoading(host.hasAttribute("data-loading")),
    );
    this.#observer.observe(host, { attributes: true, attributeFilter: ["data-loading"] });
  }

  // The morph panel is a body-level element the picker doesn't hand out, but
  // its trigger points at it.
  #panel() {
    const trigger = this.#picker.el.querySelector(".lg-chip");

    return trigger ? document.getElementById(trigger.getAttribute("aria-controls")!) : null;
  }

  #changed(id: string) {
    if (this.#hiddenInput) this.#hiddenInput.value = id;
    document.dispatchEvent(new CustomEvent("campuschange", { detail: { id } }));
  }

  // Programmatically selects a campus by ID. No-op if the ID isn't available.
  selectCampusById(id: string, _animate = true) {
    if (!this.#ids.has(id) || this.#picker.value === id) return;
    this.#picker.setValue(id);
    this.#changed(id);
  }

  // Re-applies translations: the "CAMPUS" label, the panel's title and the
  // "Other cities" section header.
  retranslate() {
    this.#picker.setLabel(t("tabs.campus"));

    const title = this.#panel()?.querySelector(".lg-morph__title-text");

    if (title) title.textContent = t("tabs.campus");

    if (this.#staticData) this.#picker.setOptions({ sections: this.#sections() });
  }

  // Group by city, then split: cities that contain a grouped campus (Milano:
  // Città Studi / Bovisa) get their own section; standalone single-campus
  // cities are collected under "Other cities".
  #sections() {
    const byCity = new Map<string | undefined, Campus[]>();

    for (const campus of this.#staticData!.filter((c) => c.buildings.length > 0)) {
      const list = byCity.get(campus.city) ?? [];

      list.push(campus);
      byCity.set(campus.city, list);
    }

    const toOption = (c: Campus) => ({ value: c.id, label: c.name, description: c.group });
    const sections: { label: string; options: ReturnType<typeof toOption>[] }[] = [];
    const others: Campus[] = [];

    for (const [city, list] of byCity) {
      if (list.some((c) => c.group))
        sections.push({ label: String(city), options: list.map(toOption) });
      else others.push(...list);
    }

    if (others.length)
      sections.push({ label: t("campus.otherLabel"), options: others.map(toOption) });

    return sections;
  }

  // Builds the option list from the static campus data, keeping only campuses
  // that actually have buildings.
  setup(staticData: Campus[]) {
    this.#staticData = staticData;

    // Set here rather than on construction: i18n isn't loaded that early.
    this.#picker.setLabel(t("tabs.campus"));

    const title = this.#panel()?.querySelector(".lg-morph__title-text");

    if (title) title.textContent = t("tabs.campus");

    const sections = this.#sections();

    this.#ids = new Set(sections.flatMap((s) => s.options.map((o) => o.value)));
    this.#picker.setOptions({ sections });

    // Silent auto-select of the first campus (setOptions falls back to it): no
    // `campuschange` event on initial population.
    if (this.#hiddenInput) this.#hiddenInput.value = this.#picker.value;
  }

  // ── Docked (inline-expanded) mode ───────────────────────────────────
  // Desktop: the listbox panel sits directly in the form column instead of
  // morphing out of the pill. picker-dock.ts toggles this. The panel is the
  // morph popup's own element (so its keyboard and hover handling keep
  // working): docking moves it next to this element and shows it open.
  setDocked(on: boolean) {
    if (on === this.#docked) return;
    this.#docked = on;
    clearTimeout(this.#dockTimer);

    const panel = this.#panel();

    if (!panel) return;

    if (on) {
      // A panel still open (or closing) owns its own cleanup, which would hide
      // the docked one: let it finish first.
      const busy =
        this.#picker.el.querySelector(".lg-chip")?.getAttribute("aria-expanded") === "true";

      if (busy) this.#picker.close();
      this.#dockTimer = window.setTimeout(() => this.#dock(panel), busy ? 800 : 0);
    } else {
      this.#undock(panel);
    }
  }

  #dock(panel: HTMLElement) {
    if (!this.#docked) return;
    this.#panelHome = panel.parentElement;
    panel.classList.add("lg-morph--open", "campus-dock");
    panel.style.display = "flex";
    this.#host.parentElement?.insertBefore(panel, this.#host.nextSibling);
    this.#host.style.display = "none";
  }

  #undock(panel: HTMLElement) {
    if (panel.classList.contains("campus-dock")) {
      panel.classList.remove("lg-morph--open", "campus-dock");
      panel.style.display = "";
      this.#panelHome?.appendChild(panel);
    }

    this.#host.style.display = "";
  }

  destroy() {
    clearTimeout(this.#dockTimer);
    this.#observer.disconnect();

    const panel = this.#panel();

    if (panel?.classList.contains("campus-dock")) this.#undock(panel);
    this.#picker.destroy();
    this.#host.style.display = "";
  }
}
