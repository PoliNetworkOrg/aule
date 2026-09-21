import { snapGeometry, morphGeometry, hideInnerBoxInstantly, unhideInnerBox } from "vitrium";

const TRANSITION_DURATION = 420;

// Swipe-to-dismiss (drag from the title row — see wireDismissDrag()).
const DISMISS_DISTANCE = 120; // px dragged down commits to close

const DISMISS_FLING_VELOCITY = 0.5; // px/ms — a fast-enough flick commits regardless of distance

const DRAG_RUBBER_GIVE = 60; // rubber-band give (px) when dragging upward, which never dismisses

// Asymptotic rubber-band (approaches ±give, never past it) — same recipe as
// campus-sheet.js's own rubber().
const rubber = (x: number, give: number) => (x * give) / (give + Math.abs(x));

export function bindSettingsMotion(
  popupEl: HTMLElement,
  triggerEl: HTMLElement,
  overlayEl: HTMLElement,
  refreshControls: () => void,
) {
  const events = new AbortController();
  const timers: number[] = [];
  const inner = popupEl.querySelector<HTMLElement>(".settings-popup__inner")!;
  // ── State ─────────────────────────────────────────────────────────────────────

  let isAnimating = false;

  let isOpen = false;

  // ── Geometry helpers ──────────────────────────────────────────────────────────

  function getPopupTarget() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(400, vw - 32);

    // Measure natural content height at the target width
    popupEl.style.width = w + "px";
    popupEl.style.height = "auto";
    const naturalH = popupEl.scrollHeight;
    popupEl.style.height = ""; // snapGeometry (via morphGeometry) sets the final value right after

    const h = Math.min(naturalH, vh - 120);

    return {
      left: (vw - w) / 2,
      top: (vh - h) / 2,
      width: w,
      height: h,
      borderRadius: "22px",
    };
  }

  function onTransitionEnd(el: HTMLElement, cb: () => void) {
    let finished = false;

    const finish = () => {
      if (finished || events.signal.aborted) return;
      finished = true;
      clearTimeout(fallback);
      el.removeEventListener("transitionend", handler);
      cb();
    };

    const fallback = window.setTimeout(finish, TRANSITION_DURATION + 50);
    timers.push(fallback);

    const handler = (e: TransitionEvent) => {
      if (e.propertyName !== "transform") return;
      clearTimeout(fallback);
      el.removeEventListener("transitionend", handler);
      finish();
    };

    el.addEventListener("transitionend", handler, { signal: events.signal });
  }

  // ── Scroll lock ───────────────────────────────────────────────────────────────

  function preventScroll(e: WheelEvent | TouchEvent) {
    const inner = e.target instanceof Element ? e.target.closest(".settings-popup__inner") : null;

    // Only hand off to native scroll when the inner actually overflows —
    // otherwise overscroll-behavior: contain has no scroll context to contain
    // and the event would fall through to the page behind.
    if (inner && inner.scrollHeight > inner.clientHeight) return;
    e.preventDefault();
  }

  function lockScroll() {
    window.addEventListener("wheel", preventScroll, { passive: false, signal: events.signal });
    window.addEventListener("touchmove", preventScroll, { passive: false, signal: events.signal });
  }

  function unlockScroll() {
    window.removeEventListener("wheel", preventScroll);
    window.removeEventListener("touchmove", preventScroll);
  }

  // ── Swipe-to-dismiss ────────────────────────────────────────────────────────────
  //
  // Bound to the title row rather than the whole popup: the row is sticky
  // (never scrolls), so there's no scroll-vs-drag ambiguity to arbitrate
  // (contrast campus-sheet.js's onPointerMove, which has to guess between
  // resizing the sheet and scrolling its content). Dragging up just
  // rubber-bands in place — this is a centered modal, not a sheet with
  // somewhere further up to go.

  let dragPointerId: number | null = null;

  let dragStartY = 0;

  let dragSamples: { y: number; t: number }[] = [];

  function pushDragSample(y: number) {
    const now = performance.now();
    dragSamples.push({ y, t: now });

    while (dragSamples.length > 2 && now - dragSamples[0].t > 100) dragSamples.shift();
  }

  function dragVelocity() {
    // px/ms, positive = pointer moving down.
    const a = dragSamples[0],
      b = dragSamples[dragSamples.length - 1];

    return b && a && b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
  }

  function onDragPointerDown(e: PointerEvent) {
    if (!isOpen || isAnimating) return;

    if (e.pointerType === "mouse" && e.button !== 0) return;

    if (e.target instanceof Element && e.target.closest(".settings-close-btn")) return; // let the close button's own click through

    dragPointerId = e.pointerId;
    dragStartY = e.clientY;
    dragSamples = [];
    pushDragSample(e.clientY);
    popupEl.style.transition = "none";
    window.addEventListener("pointermove", onDragPointerMove, { signal: events.signal });
    window.addEventListener("pointerup", onDragPointerEnd, { signal: events.signal });
    window.addEventListener("pointercancel", onDragPointerEnd, { signal: events.signal });
  }

  function onDragPointerMove(e: PointerEvent) {
    if (e.pointerId !== dragPointerId) return;
    pushDragSample(e.clientY);
    const dy = e.clientY - dragStartY;
    const applied = dy > 0 ? dy : rubber(dy, DRAG_RUBBER_GIVE);
    popupEl.style.transform = `translateY(${applied}px)`;
  }

  function onDragPointerEnd(e: PointerEvent) {
    if (e.pointerId !== dragPointerId) return;
    window.removeEventListener("pointermove", onDragPointerMove);
    window.removeEventListener("pointerup", onDragPointerEnd);
    window.removeEventListener("pointercancel", onDragPointerEnd);
    dragPointerId = null;

    const dy = e.clientY - dragStartY;
    const v = dragVelocity();

    if (dy > 0 && (dy > DISMISS_DISTANCE || v > DISMISS_FLING_VELOCITY)) {
      // Leave the popup exactly where the drag left it — closeSettings()
      // reads that via getBoundingClientRect() as the morph's starting rect,
      // so the fling continues straight into the close animation.
      popupEl.style.transition = "";
      closeSettings();

      return;
    }

    // Didn't clear the threshold — spring back to centered.
    popupEl.style.transition = "transform 0.32s cubic-bezier(0.34, 1.4, 0.64, 1)";
    popupEl.style.transform = "";
  }

  // ── Open / close ──────────────────────────────────────────────────────────────

  function openSettings() {
    if (isAnimating || isOpen) return;
    isAnimating = true;

    lockScroll();

    const rect = triggerEl.getBoundingClientRect();

    popupEl.style.transition = "none";
    popupEl.style.display = "flex"; // must be visible before getPopupTarget() measures scrollHeight

    const target = getPopupTarget(); // measures scrollHeight — needs display:flex
    popupEl.style.transition = ""; // let morphGeometry manage transition timing from here

    triggerEl.classList.add("settings-btn--morphing");
    // A close may have got as far as hiding the sections' content — undo that
    // before reopening.
    unhideInnerBox(inner);

    // Pin the real box straight to `target` and fake the button's circular
    // look via `transform`, then release it — no layout/paint per frame.
    morphGeometry(popupEl, rect, target, {
      fromRadius: "50%",
      toRadius: target.borderRadius,
      onSettle: () => {
        if (events.signal.aborted) return;
        popupEl.style.boxShadow = "var(--settings-glass-shadow)";
        popupEl.classList.add("settings-popup--open");
        overlayEl.hidden = false;
        void overlayEl.offsetWidth;
        overlayEl.classList.add("settings-overlay--active");
      },
    });
    popupEl.style.boxShadow = "var(--settings-glass-shadow)";

    refreshControls();

    onTransitionEnd(popupEl, () => {
      isAnimating = false;
      isOpen = true;
    });
  }

  function closeSettings() {
    if (isAnimating || !isOpen) return;
    isAnimating = true;

    const rect = triggerEl.getBoundingClientRect();

    popupEl.classList.remove("settings-popup--open");
    overlayEl.classList.remove("settings-overlay--active");
    overlayEl.addEventListener(
      "transitionend",
      () => {
        overlayEl.hidden = true;
      },
      { once: true, signal: events.signal },
    );

    // Cut the sections' fade-out short (instant, not the usual ~180ms) before
    // the popup's real size jumps to the (small) button box — otherwise
    // they'd still be visible while squeezed into that tiny box, and the
    // popup's transform would then visibly stretch them back up.
    hideInnerBoxInstantly(inner);

    const visualRect = popupEl.getBoundingClientRect();
    requestAnimationFrame(() => {
      if (events.signal.aborted) return;
      morphGeometry(popupEl, visualRect, rect, {
        toRadius: "50%",
        onSettle: () => {
          if (events.signal.aborted) return;
          popupEl.style.boxShadow = "var(--settings-glass-shadow)";
        },
      });
    });

    onTransitionEnd(popupEl, () => {
      popupEl.style.display = "none";
      unhideInnerBox(inner);
      triggerEl.classList.remove("settings-btn--morphing");
      isOpen = false;
      isAnimating = false;
      unlockScroll();
    });
  }

  triggerEl.addEventListener(
    "click",
    () => {
      openSettings();
    },
    { signal: events.signal },
  );
  popupEl
    .querySelector(".settings-close-btn")
    ?.addEventListener("click", closeSettings, { signal: events.signal });
  popupEl
    .querySelector<HTMLElement>(".settings-popup__title-row")
    ?.addEventListener("pointerdown", onDragPointerDown, { signal: events.signal });
  overlayEl.addEventListener("click", closeSettings, { signal: events.signal });
  overlayEl.addEventListener("touchmove", (event) => event.preventDefault(), {
    passive: false,
    signal: events.signal,
  });
  overlayEl.addEventListener("wheel", (event) => event.preventDefault(), {
    passive: false,
    signal: events.signal,
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") closeSettings();
    },
    { signal: events.signal },
  );
  window.addEventListener(
    "resize",
    () => {
      if (!isOpen || isAnimating) return;
      const target = getPopupTarget();
      snapGeometry(popupEl, target, target.borderRadius);
    },
    { signal: events.signal },
  );

  return {
    toggle() {
      if (isOpen) closeSettings();
      else openSettings();
    },
    destroy() {
      events.abort();
      timers.forEach(clearTimeout);
      unlockScroll();
      triggerEl.classList.remove("settings-btn--morphing");
    },
  };
}
