import { haptics, defaultPatterns } from "./haptics.ts";
import {
  snapGeometry,
  morphGeometry,
  hideInnerBoxInstantly,
  unhideInnerBox,
} from "../utils/flip-morph.ts";

// The header's data-fetch indicator button morphs into a glass card holding the
// freshness status + reload button, and back — the exact shell technique used
// by <campus-chip-picker> / <date-chip-picker> / time-picker.js: the shell's
// real box snaps straight to its resting geometry and a `transform` fakes the
// trigger's box, with the trigger hidden mid-morph and the inner content
// fading in once expanded (see utils/flip-morph.ts).
//
// Unlike those pickers this one keeps the `liquid-glass` class on the expanded
// card, so the press / drag-deform gesture stays alive on the open state (the
// delegated listener in liquid-glass.js picks it up; the combined transition
// that lets the morph and the deform coexist lives in data-fetch-card.css,
// mirroring the `.popover.liquid-glass` rule).
//
// script.js keeps ownership of #data-fetch-indicator-popover-container's
// contents (setupDataFetchIndicatorText); this file only relocates that
// container into the morphing card and drives the open/close geometry.

const MORPH_MS = 420;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export class DataFetchMotion {
  #trigger: HTMLElement;
  #overlay: HTMLElement;
  #popup: HTMLElement;
  #inner: HTMLElement;
  #isOpen = false;
  #isAnimating = false;
  #preventScroll: ((event: WheelEvent | TouchEvent) => void) | null = null;
  #scrollLocked = false;
  // Bumped on every open/close so deferred steps from a superseded transition
  // can detect they're stale and bail — otherwise a fast close→open tears the
  // freshly-opened card back down.
  #seq = 0;
  #cleanupTimer = 0;
  #morphCleanup: (() => void) | null = null;

  #events = new AbortController();
  constructor() {
    this.#trigger = document.getElementById("data-fetch-btn")!;
    this.#overlay = document.querySelector<HTMLElement>(".dfc-overlay")!;
    this.#popup = document.querySelector<HTMLElement>(".dfc-popup")!;
    this.#inner = this.#popup.querySelector<HTMLElement>(".dfc-popup__inner")!;
    this.#trigger.setAttribute("aria-haspopup", "dialog");
    this.#trigger.setAttribute("aria-expanded", "false");
    // ── Wiring ─────────────────────────────────────────────────────
    this.#trigger.addEventListener("click", () => this.#toggle(), { signal: this.#events.signal });
    this.#overlay.addEventListener("click", () => this.#close(), { signal: this.#events.signal });
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") this.#close();
      },
      { signal: this.#events.signal },
    );
    // The reload button is rebuilt by setupDataFetchIndicatorText each render;
    // close the card whenever a click inside it lands on that button.
    this.#inner.addEventListener(
      "click",
      (e) => {
        if (e.target instanceof Element && e.target.closest("#reload-data-btn")) this.#close();
      },
      { signal: this.#events.signal },
    );
    window.addEventListener(
      "resize",
      () => {
        if (this.#isOpen && !this.#isAnimating) {
          const target = this.#panelTarget();
          snapGeometry(this.#popup, target, target.borderRadius);
        }
      },
      { signal: this.#events.signal },
    );
  }

  // ── Geometry ──────────────────────────────────────────────────────
  #triggerBox() {
    const r = this.#trigger.getBoundingClientRect();

    return { left: r.left, top: r.top, width: r.width, height: r.height, borderRadius: "999px" };
  }

  // Final resting box — anchored to the trigger: the card's right edge aligns
  // with the trigger's right edge (the button sits at the top-right of the
  // header) and it grows downward from just below the trigger's top. Only
  // nudged inward to stay on-screen.
  #panelTarget() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const PAD = 8;
    const r = this.#trigger.getBoundingClientRect();
    const width = Math.min(20 * 16, vw - PAD * 2);

    const s = this.#popup.style;
    const prev = s.transition;
    s.transition = "none";
    s.width = `${width}px`;
    s.height = "auto";
    const height = Math.min(this.#inner.scrollHeight, vh - PAD * 2);
    s.transition = prev;

    const DROP = 8; // settles 0.5rem below the trigger
    const left = Math.max(PAD, Math.min(r.right - width, vw - width - PAD));
    const top = Math.max(PAD, Math.min(r.top + DROP, vh - height - PAD));

    return { left, top, width, height, borderRadius: "20px" };
  }

  #canMorph() {
    return !reduceMotion.matches;
  }

  // ── Open / close ──────────────────────────────────────────────────
  #toggle() {
    if (this.#isOpen) {
      this.#close();
    } else {
      this.#open();
    }
  }

  #beginOp() {
    clearTimeout(this.#cleanupTimer);
    this.#cleanupTimer = 0;
    this.#clearMorphEnd();

    return ++this.#seq;
  }

  #open() {
    if (this.#isOpen) return;
    const seq = this.#beginOp();
    this.#isOpen = true;
    this.#isAnimating = true;
    this.#trigger.setAttribute("aria-expanded", "true");
    haptics.trigger(defaultPatterns.light);
    this.#lockScroll();

    // A close may have got as far as tagging the trigger for its handoff, or
    // hiding the content (see #close) — undo both before reopening.
    this.#popup.classList.remove("dfc-popup--closing");
    this.#trigger.classList.remove("dfc-content-hidden");
    unhideInnerBox(this.#inner);

    this.#overlay.hidden = false;
    this.#popup.style.display = "flex";
    this.#trigger.classList.add("dfc-anim");

    const target = this.#panelTarget();

    if (!this.#canMorph()) {
      snapGeometry(this.#popup, target, target.borderRadius);
      this.#popup.style.transition = "none";
      this.#overlay.classList.add("is-active");
      this.#popup.classList.add("dfc-popup--open");
      this.#isAnimating = false;
      this.#afterOpen();

      return;
    }

    // Snap onto the (now hidden) trigger — this is what actually paints next.
    const triggerRect = this.#triggerBox();
    snapGeometry(this.#popup, triggerRect, triggerRect.borderRadius);

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
          this.#popup.classList.add("dfc-popup--open");
          this.#onMorphEnd(() => {
            if (seq !== this.#seq) return;
            this.#isAnimating = false;
            this.#afterOpen();
          });
        },
      });
    });
  }

  #afterOpen() {
    if (!this.#isOpen) return;
    this.#popup.focus?.({ preventScroll: true });
  }

  #close() {
    if (!this.#isOpen) return;
    const seq = this.#beginOp();
    this.#isOpen = false;
    this.#isAnimating = true;
    this.#trigger.setAttribute("aria-expanded", "false");

    this.#popup.classList.remove("dfc-popup--open");
    this.#overlay.classList.remove("is-active");

    const clear = () => {
      if (seq !== this.#seq) return;
      this.#popup.classList.remove("dfc-popup--closing");
      this.#popup.style.display = "none";
      this.#popup.style.transition = "";
      ["left", "top", "width", "height", "border-radius", "transform"].forEach((p) => {
        this.#popup.style.removeProperty(p);
      });
      unhideInnerBox(this.#inner);
      this.#overlay.hidden = true;
      this.#trigger.classList.remove("dfc-anim", "dfc-content-hidden");
      this.#unlockScroll();
    };

    if (!this.#canMorph()) {
      this.#isAnimating = false;
      clear();

      return;
    }

    // Cut the content's fade-out short (instant, not the usual ~180ms) before
    // the shell's real size jumps to the (small) trigger box — otherwise it'd
    // still be visible while its flex layout gets squeezed into that tiny box,
    // and the shell's transform would then visibly stretch it back up.
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
            this.#isAnimating = false;
            // Hand the frame back to the button: swap the identical glass box
            // instantly, fade the button's indicator back in as the shell fades out.
            this.#trigger.classList.remove("dfc-anim");
            this.#trigger.classList.add("dfc-content-hidden");
            this.#popup.classList.add("dfc-popup--closing");
            this.#overlay.hidden = true;
            this.#unlockScroll();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                if (seq !== this.#seq) return;
                this.#trigger.classList.remove("dfc-content-hidden");
              }),
            );
            this.#cleanupTimer = window.setTimeout(clear, 240);
          });
        },
      });
    });
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

  // ── Scroll lock ───────────────────────────────────────────────────
  #lockScroll() {
    if (this.#scrollLocked) return;
    this.#scrollLocked = true;
    this.#preventScroll = (e) => {
      if (
        e.target instanceof Node &&
        this.#inner.contains(e.target) &&
        this.#inner.scrollHeight > this.#inner.clientHeight
      )
        return;
      e.preventDefault();
    };

    window.addEventListener("wheel", this.#preventScroll, {
      passive: false,
      signal: this.#events.signal,
    });
    window.addEventListener("touchmove", this.#preventScroll, {
      passive: false,
      signal: this.#events.signal,
    });
  }

  #unlockScroll() {
    if (!this.#scrollLocked) return;
    this.#scrollLocked = false;
    window.removeEventListener("wheel", this.#preventScroll!);
    window.removeEventListener("touchmove", this.#preventScroll!);
    this.#preventScroll = null;
  }
  destroy() {
    this.#beginOp();
    this.#events.abort();
    this.#unlockScroll();
    this.#trigger.classList.remove("dfc-anim", "dfc-content-hidden");
    this.#trigger.setAttribute("aria-expanded", "false");
  }
}
