import { createChipPicker, attachLiquidGlass } from "vitrium";
import { t } from "../i18n.ts";

type Chip = ReturnType<typeof createChipPicker>;

interface ChipShellOptions {
  icon: string;
  labelKey: string;
  width: number;
  body: HTMLElement;
  title?: boolean;
  exclude?: string;
  deformFrom?: string;
  onBuild?: (chip: Chip) => void;
  onShow?: () => void;
}

// Shared shell of <date-chip-picker> and <time-range-chip-picker>: a Vitrium
// chip that morphs into a panel holding `body`, or, on desktop, the same body
// docked open as an inline glass card (picker-dock.ts decides which).
//
// Docking swaps the two forms instead of moving one panel between them: the
// chip and its body-level popup are destroyed and rebuilt on demand, and `body`
// (the picker's real DOM, which must survive) is moved across first.
//
//   host      the custom element the chip or dock is appended to
//   icon      HugeIcons class, e.g. 'hgi-calendar-03'
//   labelKey  i18n key for the label, the panel's title and its aria-label
//   width     the morphing panel's width in px
//   body      the node holding the picker
//   exclude   selector inside the docked card that keeps its own drags
//   title     show the icon + label title atop the panel and the dock (default
//             true; the time slider brings its own)
//   deformFrom  selector of the press/drag handle inside a title-less panel
//   onBuild(chip)   the chip was (re)built: fill in its value, add extras
//   onShow()        the body just became visible (opened or docked): re-measure
export class ChipShell {
  chip: Chip | null = null;
  dock: HTMLElement | null = null;
  docked = false;
  #options: ChipShellOptions;
  #host: HTMLElement;
  #frame = 0;

  constructor(host: HTMLElement, options: ChipShellOptions) {
    this.#host = host;
    this.#options = options;
    this.#build();
  }

  #iconHtml() {
    return `<i class="hgi-stroke ${this.#options.icon}" aria-hidden="true"></i>`;
  }

  #build() {
    const { labelKey, title = true, width, body, deformFrom, onBuild, onShow } = this.#options;

    const chip = createChipPicker({
      icon: this.#iconHtml(),
      label: t(labelKey),
      title: title ? undefined : false,
      width,
      content: body,
      onOpen: () => onShow?.(),
      onAfterOpen: () => onShow?.(),
    });

    this.chip = chip;
    chip.trigger.querySelector<HTMLElement>(".lg-chip__label")!.dataset.i18n = labelKey;

    if (deformFrom) attachLiquidGlass(chip.popup.panel, { from: deformFrom });
    this.#host.appendChild(chip.el);
    onBuild?.(chip);
  }

  #buildDock() {
    const { labelKey, title = true, exclude } = this.#options;
    const dock = document.createElement("div");

    // `data-lg-exclude` confines the press/drag deform to the card's chrome, so
    // the picker inside keeps its own drags.
    dock.className = "chip-dock lg-glass liquid-glass";

    if (exclude) dock.dataset.lgExclude = exclude;

    if (title) {
      const heading = document.createElement("div");

      heading.className = "chip-dock__title";
      heading.setAttribute("aria-hidden", "true");
      heading.innerHTML = `${this.#iconHtml()}<span data-i18n="${labelKey}">${t(labelKey)}</span>`;
      dock.appendChild(heading);
    }

    this.dock = dock;
  }

  setDocked(on: boolean) {
    if (on === this.docked) return;
    this.docked = on;

    if (on) {
      if (!this.dock) this.#buildDock();
      this.dock!.appendChild(this.#options.body); // rescue the body before its popup goes
      this.chip?.destroy();
      this.chip = null;
      this.#host.appendChild(this.dock!);
    } else {
      this.dock?.remove();
      this.#build(); // moves the body back into a new popup
    }

    this.#options.onShow?.();
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#options.onShow?.());
  }

  retranslate() {
    const label = t(this.#options.labelKey);

    if (this.chip) {
      this.chip.popup.panel.setAttribute("aria-label", label);

      const title = this.chip.popup.panel.querySelector(".lg-morph__title-text");

      if (title) title.textContent = label;
      this.chip.trigger.querySelector(".lg-chip__label")!.textContent = label;
    }

    const dockTitle = this.dock?.querySelector(".chip-dock__title span");

    if (dockTitle) dockTitle.textContent = label;
  }

  destroy() {
    cancelAnimationFrame(this.#frame);
    // The body is React's; take it out before its container is destroyed.
    this.#options.body.remove();
    this.chip?.destroy();
    this.chip = null;
    this.dock?.remove();
    this.dock = null;
  }
}
