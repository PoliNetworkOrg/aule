import { haptics, defaultPatterns } from "./haptics.ts";
import {
  snapGeometry,
  morphGeometry,
  hideInnerBoxInstantly,
  unhideInnerBox,
} from "../utils/flip-morph.ts";

const MORPH_MS = 420;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// React owns the popup's children. This controller moves its portal container
// between the document body and desktop dock and retains the original motion.
export class PickerMotion {
  #prefix: string;
  #width: number;
  #onLayout: () => void;
  #host: HTMLElement;
  #trigger: HTMLButtonElement;
  #overlay: HTMLDivElement;
  #popup: HTMLDivElement;
  #inner: HTMLDivElement;
  #isOpen = false;
  #isAnimating = false;
  #docked = false;
  #preventScroll: ((event: WheelEvent | TouchEvent) => void) | null = null;
  #scrollLocked = false;
  #seq = 0;
  #cleanupTimer = 0;
  #morphCleanup: (() => void) | null = null;
  #events = new AbortController();

  constructor(
    host: HTMLElement,
    trigger: HTMLButtonElement,
    overlay: HTMLDivElement,
    popup: HTMLDivElement,
    inner: HTMLDivElement,
    prefix = "dcp",
    width = 24,
    onLayout: () => void = () => {},
  ) {
    this.#onLayout = onLayout;
    this.#prefix = prefix;
    this.#width = width;
    this.#host = host;
    this.#trigger = trigger;
    this.#overlay = overlay;
    this.#popup = popup;
    this.#inner = inner;
    const signal = this.#events.signal;
    trigger.addEventListener("click", () => this.#toggle(), { signal });
    overlay.addEventListener("click", () => this.#close(), { signal });
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") this.#close();
      },
      { signal },
    );
    window.addEventListener(
      "resize",
      () => {
        this.#onLayout();

        if (!this.#docked && this.#isOpen && !this.#isAnimating) {
          const target = this.#panelTarget();
          snapGeometry(this.#popup, target, target.borderRadius);
        }
      },
      { signal },
    );
  }

  destroy() {
    this.#forceClose();
    this.#events.abort();
  }

  // ── Docked (inline-expanded) mode ───────────────────────────────────
  // On desktop the picker isn't a pill that morphs into a body-level popup;
  // the same glass panel sits directly in the form column. picker-dock.js
  // toggles this from a ResizeObserver on the container. Instant swap, no morph.
  setDocked(on: boolean) {
    on = !!on;

    if (on === this.#docked) return;
    this.#docked = on;

    if (on) {
      if (this.#isOpen) this.#forceClose();
      this.#trigger.hidden = true;
      this.#overlay.hidden = true;
      this.#popup.classList.remove(`${this.#prefix}-popup--closing`);
      this.#popup.classList.add(`${this.#prefix}-popup--docked`, `${this.#prefix}-popup--open`);
      (
        ["left", "top", "width", "height", "borderRadius", "transform", "transition"] as const
      ).forEach((p) => {
        this.#popup.style[p] = "";
      });
      this.#popup.style.display = "flex";
      this.#host.appendChild(this.#popup);
      this.#onLayout();
      // The sliding picker had no layout while display:none — date-picker.js's
      // own ResizeObserver on .date-picker fires on this reveal; nudge it too.
      window.dispatchEvent(new Event("resize"));
    } else {
      this.#popup.classList.remove(`${this.#prefix}-popup--docked`, `${this.#prefix}-popup--open`);
      this.#popup.style.display = "none";
      (
        ["left", "top", "width", "height", "borderRadius", "transform", "transition"] as const
      ).forEach((p) => {
        this.#popup.style[p] = "";
      });
      document.body.appendChild(this.#popup);
      this.#trigger.hidden = false;
    }
  }

  // Synchronous, motion-free teardown of an open popup (used when docking mid-open).
  #forceClose() {
    this.#beginOp();
    this.#isOpen = false;
    this.#isAnimating = false;
    this.#trigger.setAttribute("aria-expanded", "false");
    this.#popup.classList.remove(`${this.#prefix}-popup--open`, `${this.#prefix}-popup--closing`);
    this.#overlay.classList.remove("is-active");
    this.#popup.style.display = "none";
    this.#popup.style.transition = "";
    (["left", "top", "width", "height", "borderRadius", "transform"] as const).forEach((p) => {
      this.#popup.style[p] = "";
    });
    unhideInnerBox(this.#inner);
    this.#overlay.hidden = true;
    this.#host.classList.remove(`${this.#prefix}-anim`, `${this.#prefix}-content-hidden`);
    this.#unlockScroll();
  }

  // ── Geometry ────────────────────────────────────────────────────────
  #triggerBox() {
    const r = this.#trigger.getBoundingClientRect();

    return { left: r.left, top: r.top, width: r.width, height: r.height, borderRadius: "999px" };
  }

  // Final resting box — anchored locally to the trigger, same as
  // <campus-chip-picker>: top edge aligned with the trigger's top (so the pill
  // reads as growing downward into the panel) and left edge aligned with the
  // trigger's left, each only nudged inward to stay on-screen (floating-ui's
  // `shift`). Never re-centred on the viewport.
  #panelTarget() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const PAD = 8;
    const r = this.#trigger.getBoundingClientRect();
    const width = Math.min(this.#width * 16, vw - PAD * 2);

    const s = this.#popup.style;
    const prev = s.transition;
    s.transition = "none";
    s.width = `${width}px`;
    s.height = "auto";
    const height = Math.min(this.#inner.scrollHeight, vh - PAD * 2);
    s.transition = prev;

    const DROP = 8; // expanded panel settles 0.5rem below the trigger
    const left = Math.max(PAD, Math.min(r.left, vw - width - PAD));
    const top = Math.max(PAD, Math.min(r.top + DROP, vh - height - PAD));

    return { left, top, width, height, borderRadius: "22px" };
  }

  #canMorph() {
    return !reduceMotion.matches;
  }

  // ── Open / close ────────────────────────────────────────────────────
  #toggle() {
    if (this.#docked) return;

    if (this.#isOpen) {
      this.#close();
    } else {
      this.#open();
    }
  }

  // Invalidate every in-flight deferred step from the previous transition and
  // return this op's sequence id, which those steps re-check before running.
  #beginOp() {
    clearTimeout(this.#cleanupTimer);
    this.#cleanupTimer = 0;
    this.#clearMorphEnd();

    return ++this.#seq;
  }

  #open() {
    if (this.#isOpen || this.#docked) return;
    const seq = this.#beginOp();
    this.#isOpen = true;
    this.#isAnimating = true;
    this.#trigger.setAttribute("aria-expanded", "true");
    haptics.trigger(defaultPatterns.light);
    this.#lockScroll();

    // A close may have got as far as tagging the shell/pill for its handoff,
    // or hiding the picker's content (see #close) — undo both before reopening.
    this.#popup.classList.remove(`${this.#prefix}-popup--closing`);
    this.#host.classList.remove(`${this.#prefix}-content-hidden`);
    unhideInnerBox(this.#inner);

    this.#overlay.hidden = false;
    this.#popup.style.display = "flex";
    this.#host.classList.add(`${this.#prefix}-anim`);

    const target = this.#panelTarget();

    if (!this.#canMorph()) {
      snapGeometry(this.#popup, target, target.borderRadius);
      this.#popup.style.transition = "none";
      this.#overlay.classList.add("is-active");
      this.#popup.classList.add(`${this.#prefix}-popup--open`);
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
          this.#popup.classList.add(`${this.#prefix}-popup--open`);
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
    this.#onLayout();
    // The sliding picker was display:none until now; its own ResizeObserver
    // (date-picker.js) fires on the reveal and repositions the indicator.
    this.#popup.focus?.({ preventScroll: true });
  }

  #close() {
    if (!this.#isOpen) return;
    const seq = this.#beginOp();
    this.#isOpen = false;
    this.#isAnimating = true;
    this.#trigger.setAttribute("aria-expanded", "false");

    this.#popup.classList.remove(`${this.#prefix}-popup--open`);
    this.#overlay.classList.remove("is-active");

    const clear = () => {
      if (seq !== this.#seq) return;
      this.#popup.classList.remove(`${this.#prefix}-popup--closing`);
      this.#popup.style.display = "none";
      this.#popup.style.transition = "";
      (["left", "top", "width", "height", "borderRadius", "transform"] as const).forEach((p) => {
        this.#popup.style[p] = "";
      });
      unhideInnerBox(this.#inner);
      this.#overlay.hidden = true;
      this.#host.classList.remove(`${this.#prefix}-anim`, `${this.#prefix}-content-hidden`);
      this.#unlockScroll();
    };

    if (!this.#canMorph()) {
      this.#isAnimating = false;
      clear();

      return;
    }

    // Cut the picker's fade-out short (instant, not the usual ~180ms) before
    // the shell's real size jumps to the (small) trigger box — otherwise it'd
    // still be visible while its layout gets squeezed into that tiny box,
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
            // Hand the frame back to the pill: swap the identical glass box
            // instantly, fade the pill's contents in as the shell fades out.
            this.#host.classList.remove(`${this.#prefix}-anim`);
            this.#host.classList.add(`${this.#prefix}-content-hidden`);
            this.#popup.classList.add(`${this.#prefix}-popup--closing`);
            this.#overlay.hidden = true;
            this.#unlockScroll();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                if (seq !== this.#seq) return;
                this.#host.classList.remove(`${this.#prefix}-content-hidden`);
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

    const fallback = setTimeout(() => {
      this.#clearMorphEnd();
      cb();
    }, MORPH_MS + 60);

    const handler = (e: TransitionEvent) => {
      if (e.target !== this.#popup || e.propertyName !== "transform") return;
      this.#clearMorphEnd();
      cb();
    };

    this.#popup.addEventListener("transitionend", handler);
    this.#morphCleanup = () => {
      clearTimeout(fallback);
      this.#popup.removeEventListener("transitionend", handler);
      this.#morphCleanup = null;
    };
  }

  #clearMorphEnd() {
    this.#morphCleanup?.();
  }

  // ── Scroll lock ─────────────────────────────────────────────────────
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
}
