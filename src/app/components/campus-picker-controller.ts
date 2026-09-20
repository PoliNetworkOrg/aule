import {
  computePosition,
  flip,
  shift,
  offset,
} from "https://cdn.jsdelivr.net/npm/@floating-ui/dom@1/+esm";
import { haptics, defaultPatterns } from "./haptics.ts";
import { attachLiquidGlass } from "./liquid-glass.ts";
import { BLUR_STATE_EVENT } from "../utils/blur-capability.ts";
import {
  snapGeometry,
  morphGeometry,
  hideInnerBoxInstantly,
  unhideInnerBox,
} from "../utils/flip-morph.ts";
import type { Campus } from "../types";

const TYPEAHEAD_RESET_MS = 500;

// Matches the app's other morphs (settings.js, time-picker.js).
const MORPH_MS = 420;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// <campus-chip-picker> is a fully custom single-select listbox. A visually
// hidden native <select> in the shadow root stays the data model and the real
// form control — it's mirrored onto the light-DOM hidden <input name="campus">
// and is what fires the `change` event. The glass <button> trigger and the
// portaled listbox panel are the UI, driven off that <select>.
//
// Form-association can't reach into the shadow root, so the submittable field
// stays a hidden <input> in the light DOM (declared in index.html); the
// <select> value is mirrored onto it on every change.
export class CampusPickerController {
  // Overridable by a subclass (see components/campus-buildings.js) so a
  // second instance can reuse this whole class without its `change` also
  // triggering the Available tab's own `campuschange` listener.
  changeEventName = "campuschange";

  #select: HTMLSelectElement;
  #hiddenInput: HTMLInputElement;
  #trigger: HTMLButtonElement;
  #popup: HTMLDivElement;

  #rows: { id: string; name: string; el: HTMLElement }[] = []; // [{ id, el }] in visual order
  #activeIndex = -1;
  #inner: HTMLDivElement;

  #overlay: HTMLDivElement;
  #panelHost: HTMLDivElement; // <body>-level host element for the panel shadow root
  #panelRoot: ShadowRoot; // its shadow root (holds #overlay + #popup)
  #isOpen = false;

  #docked = false; // inline-expanded in the desktop column (no popup)
  #scrollLocked = false;
  #preventScroll: ((event: WheelEvent | TouchEvent) => void) | null = null;
  #typeaheadBuffer = "";
  #typeaheadTimer = 0;
  #changeWired = false;
  // Bumped on every open/close so deferred steps from a superseded transition
  // (rAF callbacks, the awaited #panelTarget, morph-end handlers, the
  // post-close cleanup timer) can detect they're stale and bail — otherwise a
  // fast close→open tears the freshly-opened popup back down.
  #seq = 0;
  #cleanupTimer = 0;
  #morphCleanup: (() => void) | null = null;

  #host: HTMLElement;
  #onValue: (value: string) => void;
  #renderOptions: (campuses: Campus[]) => void;
  #retranslate: () => void;
  #events = new AbortController();
  #glassCleanup: (() => void)[] = [];

  constructor(
    host: HTMLElement,
    panelHost: HTMLDivElement,
    onValue: (value: string) => void,
    renderOptions: (campuses: Campus[]) => void,
    retranslate: () => void,
  ) {
    this.#host = host;
    this.#onValue = onValue;
    this.#renderOptions = renderOptions;
    this.#retranslate = retranslate;
    const shadow = host.shadowRoot!;
    this.#select = shadow.querySelector<HTMLSelectElement>(".cp-native")!;
    this.#trigger = shadow.querySelector<HTMLButtonElement>(".campus-select")!;
    this.#hiddenInput = host.querySelector<HTMLInputElement>('input[type="hidden"]')!;
    this.#panelHost = panelHost;
    this.#panelRoot = panelHost.shadowRoot!;
    this.#popup = this.#panelRoot.querySelector<HTMLDivElement>(".cp-popup")!;
    this.#inner = this.#panelRoot.querySelector<HTMLDivElement>(".cp-popup__inner")!;
    this.#overlay = this.#panelRoot.querySelector<HTMLDivElement>(".cp-overlay")!;
    document.body.appendChild(panelHost);
    const triggerCleanup = attachLiquidGlass(this.#trigger);

    if (triggerCleanup) this.#glassCleanup.push(triggerCleanup);
    // Keep the press / drag-deform gesture alive on the open panel, but only
    // when grabbed by its title bar — the body is a scrollable list.
    const popupCleanup = attachLiquidGlass(this.#popup, { from: ".cp-popup__title" });

    if (popupCleanup) this.#glassCleanup.push(popupCleanup);
    this.#trigger.addEventListener("click", () => this.#toggle(), { signal: this.#events.signal });
    this.#trigger.addEventListener("keydown", (e) => this.#onTriggerKeydown(e), {
      signal: this.#events.signal,
    });
    this.#popup.addEventListener("keydown", (e) => this.#onKeydown(e), {
      signal: this.#events.signal,
    });
    this.#popup.addEventListener("click", (e) => this.#onRowClick(e), {
      signal: this.#events.signal,
    });
    this.#popup.addEventListener("pointermove", (e) => this.#onRowHover(e), {
      signal: this.#events.signal,
    });
    // The pointer-driven active row must not stay lit once the cursor leaves
    // the list (or moves onto the title / a section label).
    this.#popup.addEventListener("pointerleave", () => this.#clearPointerActive(), {
      signal: this.#events.signal,
    });
    this.#overlay.addEventListener("click", () => this.#close(), { signal: this.#events.signal });

    // Mirror the perf-gated blur verdict onto both shadow hosts — this
    // component keeps its own concrete --cp-glass-* palette rather than
    // inheriting :root's custom properties (see campus-picker.css), so it
    // can't pick up [data-blur] from document.documentElement on its own.
    this.#syncBlurState();
    window.addEventListener(BLUR_STATE_EVENT, () => this.#syncBlurState(), {
      signal: this.#events.signal,
    });
  }

  #syncBlurState() {
    const blur = document.documentElement.dataset.blur;

    if (blur) {
      this.#host.dataset.blur = blur;

      if (this.#panelHost) this.#panelHost.dataset.blur = blur;
    } else {
      delete this.#host.dataset.blur;

      if (this.#panelHost) delete this.#panelHost.dataset.blur;
    }
  }

  destroy() {
    this.#forceClose();
    this.#clearTypeahead();
    this.#events.abort();

    for (const cleanup of this.#glassCleanup) cleanup();
    this.#panelHost.remove();
  }

  // Programmatically selects a campus by ID. No-op if the ID isn't available.
  selectCampusById(id: string, _animate = true) {
    const select = this.#select;

    if (!select || !select.querySelector(`option[value="${CSS.escape(id)}"]`)) return;

    if (select.value === id) return;
    select.value = id;
    select.dispatchEvent(new Event("change"));
  }

  // Re-applies translations that live inside the shadow root (the "Other
  // cities" section header + the "CAMPUS" trigger label). Called on language
  // switch from script.js.
  retranslate() {
    this.#retranslate();
  }

  // Builds the option list from the static campus data, keeping only campuses
  // that actually have buildings.
  setup(staticData: Campus[]) {
    const select = this.#select;
    const hiddenInput = this.#hiddenInput;
    this.#renderOptions(staticData);
    this.#rows = [...this.#inner.querySelectorAll<HTMLElement>(".campus-option")].map((el) => ({
      id: el.dataset.id!,
      name: el.querySelector(".campus-option__name")!.textContent!.toLowerCase(),
      el,
    }));

    // Silent auto-select of the first campus, matching the old picker (no
    // `campuschange` event on initial population).
    if (select.options.length > 0) {
      select.selectedIndex = 0;
      hiddenInput.value = select.value;
    }

    this.#syncFromSelect();

    if (!this.#changeWired) {
      this.#changeWired = true;
      select.addEventListener(
        "change",
        () => {
          hiddenInput.value = select.value;
          this.#syncFromSelect();
          document.dispatchEvent(
            new CustomEvent(this.changeEventName, { detail: { id: select.value } }),
          );
          haptics.trigger(defaultPatterns.light);
        },
        { signal: this.#events.signal },
      );
    }
  }

  // ── Selection state ───────────────────────────────────────────────────

  // Mirrors the <select>'s current value onto the trigger label and the
  // listbox rows' aria-selected / active state.
  #syncFromSelect() {
    const value = this.#select.value;
    const selected = this.#select.selectedOptions[0];

    this.#onValue(selected?.textContent ?? "");

    this.#rows.forEach(({ id, el }, i) => {
      const isSel = id === value;
      el.setAttribute("aria-selected", isSel ? "true" : "false");

      if (isSel) this.#activeIndex = i;
    });
  }

  #commit(id: string) {
    if (this.#select.value !== id) {
      this.#select.value = id;
      this.#select.dispatchEvent(new Event("change"));
    }

    this.#close();
  }

  // ── Open / close — the glass pill morphs into the listbox panel and back,
  //    same technique as settings.js / time-picker.js: a fixed-position shell
  //    whose top/left/width/height/border-radius transition between the
  //    trigger's box and the panel's, with the trigger hidden (`.cp-anim`)
  //    and the inner content fading in once expanded. ──────────────────────

  #toggle() {
    if (this.#docked) return;

    if (this.#isOpen) {
      this.#close();
    } else {
      this.#open();
    }
  }

  // ── Docked (inline-expanded) mode ───────────────────────────────────
  // Desktop: the listbox panel sits directly in the form column instead of
  // morphing out of the pill into a fixed popup. picker-dock.js toggles this.
  // The panel lives in a <body>-level shadow host (#panelHost); docking moves
  // that host into .picker-row (as a sibling of this element) and hides the pill.
  setDocked(on: boolean) {
    on = !!on;

    if (on === this.#docked) return;
    this.#docked = on;

    if (on) {
      if (this.#isOpen) this.#forceClose();
      this.#overlay.hidden = true;
      this.#popup.classList.remove("cp-popup--closing");
      this.#popup.classList.add("cp-popup--docked", "cp-popup--open");
      (
        ["left", "top", "width", "height", "borderRadius", "transform", "transition"] as const
      ).forEach((p) => {
        this.#popup.style[p] = "";
      });
      this.#popup.style.display = "flex";
      this.#panelHost.classList.add("cp-panel-host--docked");
      this.#host.parentElement?.insertBefore(this.#panelHost, this.#host.nextSibling);
      this.#host.style.display = "none";
      this.#setActive(this.#activeIndex >= 0 ? this.#activeIndex : 0, { scroll: "auto" });
    } else {
      this.#popup.classList.remove("cp-popup--docked", "cp-popup--open");
      this.#popup.style.display = "none";
      (
        ["left", "top", "width", "height", "borderRadius", "transform", "transition"] as const
      ).forEach((p) => {
        this.#popup.style[p] = "";
      });
      this.#panelHost.classList.remove("cp-panel-host--docked");
      document.body.appendChild(this.#panelHost);
      this.#host.style.display = "";
    }
  }

  #forceClose() {
    this.#beginOp();
    this.#isOpen = false;

    this.#trigger.setAttribute("aria-expanded", "false");
    this.#popup.classList.remove("cp-popup--open", "cp-popup--closing");
    this.#overlay.classList.remove("is-active");
    this.#popup.style.display = "none";
    this.#popup.style.transition = "";
    (["left", "top", "width", "height", "borderRadius", "transform"] as const).forEach((p) => {
      this.#popup.style[p] = "";
    });
    unhideInnerBox(this.#inner);
    this.#overlay.hidden = true;
    this.#host.classList.remove("cp-anim", "cp-content-hidden");
    this.#unlockScroll();
  }

  // Invalidate every in-flight deferred step from the previous transition and
  // return this op's sequence id, which those steps re-check before running.
  #beginOp() {
    clearTimeout(this.#cleanupTimer);
    this.#cleanupTimer = 0;
    this.#clearMorphEnd();

    return ++this.#seq;
  }

  #onMorphEnd(cb: () => void) {
    this.#clearMorphEnd();

    const fallback = window.setTimeout(() => {
      this.#clearMorphEnd();
      cb();
    }, MORPH_MS + 60);

    const handler = (e: TransitionEvent) => {
      if (e.target !== this.#popup || e.propertyName !== "transform") return;
      this.#clearMorphEnd();
      cb();
    };

    this.#popup.addEventListener("transitionend", handler, { signal: this.#events.signal });
    this.#morphCleanup = () => {
      clearTimeout(fallback);
      this.#popup.removeEventListener("transitionend", handler);
      this.#morphCleanup = null;
    };
  }

  #clearMorphEnd() {
    this.#morphCleanup?.();
  }

  // Final resting box of the panel: full width, natural (capped) height,
  // top edge 0.5rem below the trigger's top so it reads as the pill growing
  // downward into the panel.
  async #panelTarget() {
    const s = this.#popup.style;
    s.transition = "none";
    s.width = "";
    s.height = "auto";
    const width = this.#popup.offsetWidth;
    // Grow to fit the whole list; only cap (→ scroll) when it can't fit the
    // viewport. `shift({ padding: 8 })` below keeps a full-height panel on
    // screen.
    const height = Math.min(this.#inner.scrollHeight, window.innerHeight - 16);
    s.height = `${height}px`;

    const { x, y } = await computePosition(this.#trigger, this.#popup, {
      strategy: "fixed",
      placement: "bottom-start",
      middleware: [
        offset(({ rects }) => 8 - rects.reference.height), // 0.5rem below the trigger's top
        flip({ padding: 8 }),
        shift({ padding: 8 }),
      ],
    });

    return { left: x, top: y, width, height, borderRadius: "16px" };
  }

  #triggerBox() {
    const r = this.#trigger.getBoundingClientRect();

    return { left: r.left, top: r.top, width: r.width, height: r.height, borderRadius: "999px" };
  }

  async #open() {
    if (this.#isOpen || this.#docked) return;
    const seq = this.#beginOp();
    this.#isOpen = true;

    this.#trigger.setAttribute("aria-expanded", "true");
    haptics.trigger(defaultPatterns.light);
    this.#lockScroll();

    // A close may have got as far as tagging the shell/pill for its handoff,
    // or hiding the list's content (see #close) — undo both before reopening.
    this.#popup.classList.remove("cp-popup--closing");
    this.#host.classList.remove("cp-content-hidden");
    unhideInnerBox(this.#inner);

    this.#overlay.hidden = false;
    this.#popup.style.display = "flex";
    this.#host.classList.add("cp-anim");

    const target = await this.#panelTarget();

    if (seq !== this.#seq) return; // superseded while awaiting layout

    if (!this.#canMorph()) {
      snapGeometry(this.#popup, target, target.borderRadius);
      this.#popup.style.transition = "none";
      this.#overlay.classList.add("is-active");
      this.#popup.classList.add("cp-popup--open");

      this.#afterOpen();

      return;
    }

    // Snap onto the (now hidden) trigger — this is what actually paints next.
    const triggerRect = this.#triggerBox();
    snapGeometry(this.#popup, triggerRect, triggerRect.borderRadius);
    this.#popup.style.transition = "";

    requestAnimationFrame(() => {
      if (seq !== this.#seq) return;
      // Pin the real box straight to `target` and fake the trigger's look
      // via `transform`, then release it — no layout/paint per frame.
      morphGeometry(this.#popup, triggerRect, target, {
        fromRadius: triggerRect.borderRadius,
        toRadius: target.borderRadius,
        onSettle: () => {
          if (seq !== this.#seq) return;
          this.#overlay.classList.add("is-active");
          this.#popup.classList.add("cp-popup--open");
          this.#onMorphEnd(() => {
            if (seq !== this.#seq) return;

            this.#afterOpen();
          });
        },
      });
    });
  }

  #afterOpen() {
    if (!this.#isOpen) return;
    this.#setActive(this.#activeIndex >= 0 ? this.#activeIndex : 0, { scroll: "auto" });
    this.#popup.focus({ preventScroll: true });
  }

  #close() {
    if (!this.#isOpen) return;
    const seq = this.#beginOp();
    this.#isOpen = false;

    this.#trigger.setAttribute("aria-expanded", "false");
    this.#clearTypeahead();

    const returnFocus =
      this.#panelRoot.activeElement === this.#popup ||
      this.#popup.contains(this.#panelRoot.activeElement);

    this.#popup.classList.remove("cp-popup--open");
    this.#overlay.classList.remove("is-active");

    const clear = () => {
      if (seq !== this.#seq) return;
      this.#popup.classList.remove("cp-popup--closing");
      this.#popup.style.display = "none";
      this.#popup.style.transition = "";
      (["left", "top", "width", "height", "borderRadius", "transform"] as const).forEach((p) => {
        this.#popup.style[p] = "";
      });
      unhideInnerBox(this.#inner);
      this.#overlay.hidden = true;
      this.#host.classList.remove("cp-anim", "cp-content-hidden");
      this.#unlockScroll();
    };

    if (!this.#canMorph()) {
      clear();

      if (returnFocus) this.#trigger.focus({ preventScroll: true });

      return;
    }

    // Cut the list's fade-out short (instant, not the usual ~180ms) before the
    // shell's real size jumps to the (small) trigger box — otherwise it'd
    // still be visible while its flex layout gets squeezed into that tiny
    // box, and the shell's transform would then visibly stretch it back up.
    hideInnerBoxInstantly(this.#inner);

    // A superseded open may have left transitions disabled — re-enable so the
    // return-morph always animates.
    this.#popup.style.transition = "";
    const visualRect = this.#popup.getBoundingClientRect();
    requestAnimationFrame(() => {
      if (seq !== this.#seq) return;
      const triggerRect = this.#triggerBox();
      morphGeometry(this.#popup, visualRect, triggerRect, {
        toRadius: triggerRect.borderRadius,
        onSettle: () => {
          if (seq !== this.#seq) return;
          this.#onMorphEnd(() => {
            if (seq !== this.#seq) return;

            // Hand the frame back to the pill: its glass box matches the collapsed
            // shell, so swap instantly, but fade the pill's contents (icon / label
            // / value / chevron) in while the shell cross-fades out.
            this.#host.classList.remove("cp-anim");
            this.#host.classList.add("cp-content-hidden");
            this.#popup.classList.add("cp-popup--closing");
            this.#overlay.hidden = true;
            this.#unlockScroll();

            if (returnFocus) this.#trigger.focus({ preventScroll: true });
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                if (seq !== this.#seq) return;
                this.#host.classList.remove("cp-content-hidden");
              }),
            );
            this.#cleanupTimer = window.setTimeout(clear, 240);
          });
        },
      });
    });
  }

  #canMorph() {
    return !reduceMotion.matches;
  }

  #lockScroll() {
    if (this.#scrollLocked) return;
    this.#scrollLocked = true;
    this.#preventScroll = (e) => {
      // e.target is retargeted to the panel host once the event reaches
      // window — use composedPath to see into the shadow tree.
      const overInner = e.composedPath().includes(this.#inner);

      if (overInner && this.#inner.scrollHeight > this.#inner.clientHeight) return;
      e.preventDefault();
    };

    window.addEventListener("wheel", this.#preventScroll, { passive: false });
    window.addEventListener("touchmove", this.#preventScroll, { passive: false });
  }

  #unlockScroll() {
    if (!this.#scrollLocked) return;
    this.#scrollLocked = false;

    if (this.#preventScroll) {
      window.removeEventListener("wheel", this.#preventScroll);
      window.removeEventListener("touchmove", this.#preventScroll);
    }

    this.#preventScroll = null;
  }

  // ── Keyboard ──────────────────────────────────────────────────────────

  #onTriggerKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      // Let Enter/Space fall through to the native button click on keyup,
      // but ArrowDown/Up should open + move.
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this.#open();
      }
    }
  }

  #onKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.#moveActive(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        this.#moveActive(-1);
        break;
      case "Home":
        e.preventDefault();
        this.#setActive(0);
        break;
      case "End":
        e.preventDefault();
        this.#setActive(this.#rows.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();

        if (this.#rows[this.#activeIndex]) this.#commit(this.#rows[this.#activeIndex].id);
        break;
      case "Escape":
        e.preventDefault();
        this.#close();
        break;
      case "Tab":
        this.#close();
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          this.#typeahead(e.key);
        }
    }
  }

  #moveActive(delta: number) {
    const n = this.#rows.length;

    if (!n) return;

    const next =
      this.#activeIndex < 0 ? (delta > 0 ? 0 : n - 1) : (this.#activeIndex + delta + n) % n;

    this.#setActive(next);
  }

  #setActive(
    index: number,
    { scroll = "nearest" }: { scroll?: ScrollLogicalPosition | "auto" } = {},
  ) {
    if (index < 0 || index >= this.#rows.length) return;
    this.#rows.forEach(({ el }, i) => el.classList.toggle("is-active", i === index));
    this.#activeIndex = index;
    const el = this.#rows[index].el;
    this.#popup.setAttribute("aria-activedescendant", el.id);

    if (scroll !== "auto") el.scrollIntoView({ block: scroll });
  }

  #typeahead(char: string) {
    this.#typeaheadBuffer += char.toLowerCase();
    clearTimeout(this.#typeaheadTimer);
    this.#typeaheadTimer = window.setTimeout(() => this.#clearTypeahead(), TYPEAHEAD_RESET_MS);

    const match = this.#rows.findIndex((r) => r.name.startsWith(this.#typeaheadBuffer));

    if (match >= 0) this.#setActive(match);
  }

  #clearTypeahead() {
    this.#typeaheadBuffer = "";
    clearTimeout(this.#typeaheadTimer);
  }

  // ── Pointer ───────────────────────────────────────────────────────────

  #onRowClick(e: MouseEvent) {
    const row =
      e.target instanceof Element ? e.target.closest<HTMLElement>('[role="option"]') : null;

    if (row) this.#commit(row.dataset.id!);
  }

  #onRowHover(e: PointerEvent) {
    const row =
      e.target instanceof Element ? e.target.closest<HTMLElement>('[role="option"]') : null;

    if (!row) {
      // Pointer is inside the panel but not over a row (title, section label,
      // padding) — drop the hover highlight.
      this.#clearPointerActive();

      return;
    }

    const i = this.#rows.findIndex((r) => r.el === row);

    if (i >= 0 && i !== this.#activeIndex) this.#setActive(i, { scroll: "auto" });
  }

  // Clears the pointer-driven active row. Keyboard navigation re-establishes it
  // on the next arrow key; the committed selection keeps its own styling via
  // [aria-selected].
  #clearPointerActive() {
    const active = this.#rows.filter(({ el }) => el.classList.contains("is-active"));

    if (!active.length) return;
    active.forEach(({ el }) => el.classList.remove("is-active"));
    this.#activeIndex = this.#rows.findIndex((r) => r.id === this.#select.value);
    this.#popup.removeAttribute("aria-activedescendant");
  }
}
