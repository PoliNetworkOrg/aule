import { observeInputProperty } from "./time-input";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal, flushSync } from "react-dom";
import { getTranslationVersion, onTranslationChange } from "../i18n";

export interface TimeCard extends HTMLButtonElement {
  _popup: HTMLDivElement;
  _input: HTMLInputElement;
  _original: HTMLInputElement;
  _timeDisplay: HTMLElement;
  _isFrom: boolean;
  _switchBtn: HTMLButtonElement;
  _updateQuickLabel: () => void;
  _renderValue: (value: string) => void;
  _sourceRect?: DOMRect;
}

// components/time-picker.js
// Morph-card time picker component.
// Replaces each .time-picker wrapper with a card that morphs into a popup.

import { t, onLanguageSwitch, animateI18nElement } from "../i18n.ts";
import { createTimeFormatter } from "../utils/time-format.ts";
import { snapGeometry, morphGeometry, hideInnerBoxInstantly, unhideInnerBox } from "vitrium";

const TRANSITION_DURATION = 420; // ms — must match CSS

// ── Breakpoint ────────────────────────────────────────────────────────────────

const DESKTOP_MQ = window.matchMedia("(min-width: 52rem)");

// ── State ────────────────────────────────────────────────────────────────────

let activeCard: TimeCard | null = null;

let isAnimating = false;

// ── Geometry helpers ─────────────────────────────────────────────────────────

function getPopupTarget() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(340, vw - 40);
  const h = 400;

  return {
    left: (vw - w) / 2,
    top: (vh - h) / 2,
    width: w,
    height: h,
    borderRadius: "22px",
  };
}

// ── Time display formatter ────────────────────────────────────────────────────

// Track all active picker cards so they can be refreshed when the format changes.
const _allCards = new Set<TimeCard>();

function formatTimeDisplay(val: string) {
  if (!val) return "--:--";
  const [h, m] = val.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);

  return createTimeFormatter().format(d);
}

// Measure the rendered pixel width of `text` as if styled like `referenceEl`.
function measureTextWidth(text: string, referenceEl: HTMLElement) {
  const probe = document.createElement("span");
  const cs = getComputedStyle(referenceEl);
  probe.style.cssText = `
    position:absolute; visibility:hidden; white-space:nowrap; pointer-events:none;
    font-family:${cs.fontFamily}; font-size:${cs.fontSize};
    font-weight:${cs.fontWeight}; letter-spacing:${cs.letterSpacing};
  `;
  probe.textContent = text;
  document.body.appendChild(probe);
  const w = probe.getBoundingClientRect().width;
  probe.remove();

  return w;
}

// ── Overlay (created on open, removed on close) ──────────────────────────────

let overlay: HTMLDivElement | null = null;

let overlayVisible = false;

const overlayListeners = new Set<() => void>();

function subscribeOverlay(listener: () => void) {
  overlayListeners.add(listener);

  return () => {
    overlayListeners.delete(listener);
  };
}

function renderOverlay(visible: boolean) {
  overlayVisible = visible;
  flushSync(() => overlayListeners.forEach((listener) => listener()));
}

export function TimePickerBackdrop() {
  const visible = useSyncExternalStore(subscribeOverlay, () => overlayVisible);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!visible || !ref.current) return;
    const element = ref.current;
    overlay = element;
    const events = new AbortController();
    element.addEventListener("touchmove", preventScroll, { passive: false, signal: events.signal });
    element.addEventListener("wheel", preventScroll, { passive: false, signal: events.signal });

    return () => {
      events.abort();

      if (overlay === element) overlay = null;
    };
  }, [visible]);

  return visible
    ? createPortal(
        <div
          ref={ref}
          className="tp-overlay"
          onClick={() => {
            closePicker();
          }}
        />,
        document.body,
      )
    : null;
}

function getOverlay() {
  if (!overlay) renderOverlay(true);

  return overlay!;
}

function removeOverlay() {
  overlay?.addEventListener("transitionend", () => renderOverlay(false), { once: true });
}

// ── Scroll lock ───────────────────────────────────────────────────────────────

function preventScroll(e: Event) {
  e.preventDefault();
}

function lockScroll() {
  window.addEventListener("wheel", preventScroll, { passive: false });
  window.addEventListener("touchmove", preventScroll, { passive: false });
}

function unlockScroll() {
  window.removeEventListener("wheel", preventScroll);
  window.removeEventListener("touchmove", preventScroll);
}

// ── transitionend with fallback ───────────────────────────────────────────────

const motionCleanups = new Map<HTMLElement, Set<() => void>>();

function ownMotion(el: HTMLElement, cleanup: () => void) {
  let owned = motionCleanups.get(el);

  if (!owned) {
    owned = new Set();
    motionCleanups.set(el, owned);
  }

  owned.add(cleanup);
}

function onTransitionEnd(el: HTMLElement, cb: () => void) {
  let settled = false;

  const settle = () => {
    if (settled) return;
    settled = true;
    clearTimeout(fallback);
    el.removeEventListener("transitionend", settle);
    motionCleanups.get(el)?.delete(cancel);

    if (el.isConnected) cb();
  };

  const fallback = window.setTimeout(settle, TRANSITION_DURATION + 50);

  const cancel = () => {
    settled = true;
    clearTimeout(fallback);
    el.removeEventListener("transitionend", settle);
  };

  ownMotion(el, cancel);
  el.addEventListener("transitionend", settle, { once: true });
}

function animatePopup(el: HTMLElement, animate: () => () => void) {
  const frame = requestAnimationFrame(() => {
    motionCleanups.get(el)?.delete(cancelFrame);

    if (el.isConnected) ownMotion(el, animate());
  });

  const cancelFrame = () => cancelAnimationFrame(frame);
  ownMotion(el, cancelFrame);
}

// ── Open / close / switch ─────────────────────────────────────────────────────

function switchPicker(nextCard: TimeCard) {
  if (isAnimating || !activeCard || nextCard === activeCard) return;
  isAnimating = true;

  const prevCard = activeCard;
  const prevPopup = prevCard._popup;
  const nextPopup = nextCard._popup;
  activeCard = nextCard;

  nextCard._updateQuickLabel?.();

  // ── Close outgoing: morph back to its card ───────────────────────────────
  prevCard._input.blur();
  prevPopup.classList.remove("tp-popup--open");
  prevCard.classList.remove("tp-card--morphing"); // card re-appears as the morph target

  const prevRect = prevCard._sourceRect ?? prevCard.getBoundingClientRect();
  const prevVisualRect = prevPopup.getBoundingClientRect();
  const prevInner = prevPopup.querySelector<HTMLElement>(".tp-popup__inner")!;
  // Cut the content's fade-out short (instant, not the usual ~180ms) before
  // the shell's real size jumps to the (small) card box: the shell's
  // `transform` composes onto every descendant, so any content still visible
  // mid-fade would get doubly scaled as the shell fakes its "still large"
  // look, visibly stretching it.
  hideInnerBoxInstantly(prevInner);
  animatePopup(prevPopup, () => {
    return morphGeometry(prevPopup, prevVisualRect, prevRect, {
      toRadius: "18px",
      onSettle: () => {
        prevPopup.style.boxShadow = "var(--shadow)";
      },
    });
  });

  onTransitionEnd(prevPopup, () => {
    prevPopup.style.display = "none";
    unhideInnerBox(prevInner);
  });

  // ── Open incoming: morph from its card — simultaneously ──────────────────
  const nextRect = nextCard._sourceRect ?? nextCard.getBoundingClientRect();
  nextCard._sourceRect = nextRect;

  snapGeometry(nextPopup, nextRect, "18px");
  nextPopup.style.boxShadow = "var(--shadow)";
  nextPopup.style.zIndex = "1201"; // stay on top of the shrinking popup
  nextPopup.style.display = "flex";
  nextCard.classList.add("tp-card--morphing");

  animatePopup(nextPopup, () => {
    return morphGeometry(nextPopup, nextRect, getPopupTarget(), {
      fromRadius: "18px",
      toRadius: "22px",
      onSettle: () => {
        nextPopup.style.boxShadow = "var(--tp-shadow-lg)";
        nextPopup.classList.add("tp-popup--open");
      },
    });
  });

  onTransitionEnd(nextPopup, () => {
    nextPopup.style.zIndex = "";
    isAnimating = false;
    nextCard._input.focus();
  });
}

export function openPicker(cardEl: TimeCard, sourceRect: DOMRect | null = null) {
  if (isAnimating) return;
  isAnimating = true;
  activeCard = cardEl;

  const popup = cardEl._popup;
  const rect = sourceRect ?? cardEl.getBoundingClientRect();
  cardEl._sourceRect = rect; // store for closePicker / switchPicker

  lockScroll();

  // Snap popup over the source (no transition); use pill radius when opening from a badge
  const initialRadius = sourceRect ? "999px" : "18px";
  snapGeometry(popup, rect, initialRadius);
  popup.style.boxShadow = "var(--shadow)";
  popup.style.display = "flex";

  cardEl.classList.add("tp-card--morphing");

  animatePopup(popup, () => {
    return morphGeometry(popup, rect, getPopupTarget(), {
      fromRadius: initialRadius,
      toRadius: "22px",
      onSettle: () => {
        if (!popup.isConnected) return;
        popup.style.boxShadow = "var(--tp-shadow-lg)";
        popup.classList.add("tp-popup--open");
        getOverlay().classList.add("tp-overlay--active");
      },
    });
  });

  onTransitionEnd(popup, () => {
    isAnimating = false;
    cardEl._input.focus();
  });
}

function closePicker() {
  if (isAnimating || !activeCard) return;
  isAnimating = true;

  const cardEl = activeCard;
  const popup = cardEl._popup;
  const rect = cardEl._sourceRect ?? cardEl.getBoundingClientRect();

  cardEl._input.blur();
  popup.classList.remove("tp-popup--open");

  getOverlay().classList.remove("tp-overlay--active");
  removeOverlay();

  const visualRect = popup.getBoundingClientRect();
  const closingInner = popup.querySelector<HTMLElement>(".tp-popup__inner")!;
  hideInnerBoxInstantly(closingInner);
  animatePopup(popup, () => {
    return morphGeometry(popup, visualRect, rect, {
      toRadius: "18px",
      onSettle: () => {
        if (!popup.isConnected) return;
        popup.style.boxShadow = "var(--shadow)";
      },
    });
  });

  onTransitionEnd(popup, () => {
    popup.style.display = "none";
    unhideInnerBox(closingInner);
    cardEl.classList.remove("tp-card--morphing");
    activeCard = null;
    isAnimating = false;
    unlockScroll();
  });
}

export function TimePicker({ input }: { input: HTMLInputElement }) {
  const isFrom = input.id === "from-time-picker";
  const labelKey = isFrom ? "form.fromTitle" : "form.toTitle";
  const subtitleKey = isFrom ? "form.fromSubtitle" : "form.toSubtitle";
  const cardRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [popup] = useState(() => {
    const element = document.createElement("div");
    element.className = "tp-popup";
    element.style.display = "none";

    return element;
  });

  const [display, setDisplay] = useState(() => formatTimeDisplay(input.value));

  const [quickLabel, setQuickLabel] = useState(() =>
    t(isFrom ? "timepicker.currentSlot" : "timepicker.fromPlusOne"),
  );

  const language = useSyncExternalStore(onTranslationChange, getTranslationVersion);
  const previousLanguage = useRef(language);
  useLayoutEffect(() => {
    if (previousLanguage.current === language) return;
    previousLanguage.current = language;

    for (const element of popup.querySelectorAll<HTMLElement>("h4,p,.tp-text-node"))
      animateI18nElement(element);
    const label = cardRef.current?.querySelector<HTMLElement>(".tp-card__label");

    if (label) animateI18nElement(label);
  }, [language, popup]);
  useLayoutEffect(() => {
    const button = cardRef.current;
    const popupInput = inputRef.current!;

    if (!button || !popupInput) return;
    const inputEl = input;
    const widestSample = createTimeFormatter().format(new Date(2000, 0, 1, 12, 0));
    document.body.appendChild(popup);
    // ── // ── Cross-references ────────────────────────────────────────────────────

    const events = new AbortController();
    const signal = events.signal;

    const card = Object.assign(button, {
      _popup: popup,
      _input: popupInput,
      _original: inputEl,
      _timeDisplay: button.querySelector<HTMLElement>(".tp-card__time")!,
      _isFrom: isFrom,
      _switchBtn: popup.querySelector<HTMLButtonElement>(".tp-popup__switch")!,
      _updateQuickLabel: () => {},
      _renderValue: (value: string) => setDisplay(formatTimeDisplay(value)),
    });

    card._input = popupInput;
    card._original = inputEl;
    card._timeDisplay = card.querySelector<HTMLElement>(".tp-card__time")!;
    card._isFrom = isFrom;
    card._switchBtn = popup.querySelector<HTMLButtonElement>(".tp-popup__switch")!;
    _allCards.add(card);
    // Defer measurement until fonts are loaded so DS-Digital is available
    // Only fix the card display width (prevents layout shift as hours change 1→2 digits).
    // The popup input is left unsized so the browser can accommodate locale-specific
    // chrome (e.g. Firefox's AM/PM toggle) without clipping.
    void document.fonts.ready.then(() => {
      if (signal.aborted) return;
      const w = measureTextWidth(widestSample, card._timeDisplay);
      card._timeDisplay.style.minWidth = `${Math.ceil(w)}px`;
    });

    // ── Sync: popup input → original input + card display ──────────────────

    function syncValue(val: string) {
      inputEl.value = val;
      card._renderValue(val);
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    }

    popupInput.addEventListener("input", () => syncValue(popupInput.value), { signal });

    const observer = new MutationObserver(() => {
      if (popupInput.value !== inputEl.value) popupInput.value = inputEl.value;
      card._renderValue(inputEl.value);
    });

    observer.observe(inputEl, { attributes: true, attributeFilter: ["value"] });

    const restoreValue = observeInputProperty(inputEl, "value", (value) => {
      popupInput.value = value;
      card._renderValue(value);
    });

    const restoreMin = observeInputProperty(inputEl, "min", (value) => {
      popupInput.min = value;
    });

    const restoreMax = observeInputProperty(inputEl, "max", (value) => {
      popupInput.max = value;
    });

    // ── Preset buttons ────────────────────────────────────────────────────────

    function clampTime(h: number, m: number) {
      const effectiveMin = popupInput.min || "07:15";
      const effectiveMax = popupInput.max || "20:15";
      const total = h * 60 + m;
      const [minH, minM] = effectiveMin.split(":").map(Number);
      const [maxH, maxM] = effectiveMax.split(":").map(Number);
      const clamped = Math.min(Math.max(total, minH * 60 + minM), maxH * 60 + maxM);

      return [Math.floor(clamped / 60), clamped % 60];
    }

    function applyPreset(h: number, m: number) {
      const [ch, cm] = clampTime(h, m);
      const val = `${String(ch).padStart(2, "0")}:${String(cm).padStart(2, "0")}`;
      popupInput.value = val;
      syncValue(val);
    }

    popup.querySelector<HTMLElement>(".tp-quick-now")?.addEventListener(
      "click",
      () => {
        const now = new Date();
        applyPreset(now.getHours(), now.getMinutes());
      },
      { signal },
    );

    popup.querySelector<HTMLElement>(".tp-quick-preset")!.addEventListener(
      "click",
      () => {
        const now = new Date();

        if (isFrom) {
          const h = now.getMinutes() >= 45 ? (now.getHours() + 1) % 24 : now.getHours();

          const maxVal = popupInput.max || "20:15";
          const [maxH, maxM] = maxVal.split(":").map(Number);
          const maxTotal = maxH * 60 + maxM;

          let targetTotal = h * 60 + 15;

          if (targetTotal + 60 > maxTotal) {
            targetTotal = Math.max(0, maxTotal - 60);
          }

          applyPreset(Math.floor(targetTotal / 60), targetTotal % 60);
        } else {
          const fromInput = document.querySelector<HTMLInputElement>(
            '.time-picker input[type="time"]',
          );

          if (fromInput?.value) {
            const [fh, fm] = fromInput.value.split(":").map(Number);
            applyPreset((fh + 1) % 24, fm);
          } else {
            applyPreset((now.getHours() + 1) % 24, now.getMinutes());
          }
        }
      },
      { signal },
    );

    // ── ±1h step buttons ──────────────────────────────────────────────────────

    function stepHour(delta: number) {
      const [h, m] = (popupInput.value || "00:00").split(":").map(Number);
      const [ch, cm] = clampTime(h + delta, m);
      const val = `${String(ch).padStart(2, "0")}:${String(cm).padStart(2, "0")}`;
      popupInput.value = val;
      syncValue(val);
    }

    popup
      .querySelector<HTMLElement>(".tp-step-minus")!
      .addEventListener("click", () => stepHour(-1), { signal });
    popup
      .querySelector<HTMLElement>(".tp-step-plus")!
      .addEventListener("click", () => stepHour(+1), { signal });

    // ── Quick preset label ────────────────────────────────────────────────────

    function updateQuickLabel() {
      if (isFrom) {
        const now = new Date();
        const h = now.getMinutes() >= 45 ? (now.getHours() + 1) % 24 : now.getHours();

        const maxVal = popupInput.max || "20:15";
        const [maxH, maxM] = maxVal.split(":").map(Number);
        const maxTotal = maxH * 60 + maxM;

        let targetTotal = h * 60 + 15;

        if (targetTotal + 60 > maxTotal) {
          targetTotal = Math.max(0, maxTotal - 60);
        }

        const targetH = Math.floor(targetTotal / 60);
        const targetM = targetTotal % 60;

        setQuickLabel(
          formatTimeDisplay(
            `${String(targetH).padStart(2, "0")}:${String(targetM).padStart(2, "0")}`,
          ),
        );
      } else {
        const fromInput = document.querySelector<HTMLInputElement>(
          '.time-picker input[type="time"]',
        );

        if (fromInput?.value) {
          const [fh, fm] = fromInput.value.split(":").map(Number);
          const h = (fh + 1) % 24;
          setQuickLabel(
            formatTimeDisplay(`${String(h).padStart(2, "0")}:${String(fm).padStart(2, "0")}`),
          );
        } else {
          setQuickLabel(t("timepicker.fromPlusOne"));
        }
      }
    }

    if (!isFrom) {
      const fromInput = document.querySelector<HTMLInputElement>('.time-picker input[type="time"]');

      if (fromInput) fromInput.addEventListener("input", updateQuickLabel, { signal });
    }

    updateQuickLabel();
    card._updateQuickLabel = updateQuickLabel;

    // ── Done button ───────────────────────────────────────────────────────────

    popup.querySelector<HTMLElement>(".tp-popup__done")!.addEventListener(
      "click",
      () => {
        closePicker();
      },
      { signal },
    );

    const unsubscribe = onLanguageSwitch(() => {
      updateQuickLabel();
    });

    popup.querySelector<HTMLButtonElement>(".tp-popup__switch")!.addEventListener(
      "click",
      () => {
        const other = [..._allCards].find((entry) => entry._isFrom !== isFrom);

        if (other) switchPicker(other);
      },
      { signal },
    );

    const onFormat = () => {
      card._renderValue(inputEl.value);
      updateQuickLabel();
      void document.fonts.ready.then(() => {
        if (signal.aborted) return;
        const sample = createTimeFormatter().format(new Date(2000, 0, 1, 12, 0));
        card._timeDisplay.style.minWidth = `${Math.ceil(measureTextWidth(sample, card._timeDisplay))}px`;
      });
    };

    window.addEventListener("timeformatchange", onFormat, { signal });

    if (isFrom) {
      window.addEventListener(
        "resize",
        () => {
          if (activeCard && !isAnimating) snapGeometry(activeCard._popup, getPopupTarget(), "22px");
        },
        { signal },
      );
      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") closePicker();
        },
        { signal },
      );
    }
    // ── Card click (mobile only) ──────────────────────────────────────────────

    card.addEventListener(
      "click",
      () => {
        if (DESKTOP_MQ.matches) return; // inline on desktop — card is not a trigger
        updateQuickLabel();
        openPicker(card);
      },
      { signal },
    );

    return () => {
      events.abort();
      motionCleanups.get(popup)?.forEach((cleanup) => cleanup());
      motionCleanups.delete(popup);
      unsubscribe();
      observer.disconnect();
      restoreMax();
      restoreMin();
      restoreValue();
      _allCards.delete(card);

      if (activeCard === card) {
        activeCard = null;
        isAnimating = false;
        unlockScroll();
        overlayVisible = false;
        queueMicrotask(() => {
          if (!activeCard) renderOverlay(false);
        });
      }

      popup.remove();
    };
  }, [input, isFrom, popup]);

  return (
    <>
      <button
        ref={cardRef}
        type="button"
        className="tp-card"
        style={{ display: "none" }}
        data-react-owned=""
      >
        <div className="tp-card__icon-wrap">
          <i className="hgi-stroke hgi-clock-01" aria-hidden="true" />
        </div>
        <div className="tp-card__info">
          <span className="tp-card__label">{t(labelKey)}</span>
          <span className="tp-card__time">{display}</span>
        </div>
        <i className="hgi-stroke hgi-chevron-right tp-card__chevron" aria-hidden="true" />
      </button>
      {createPortal(
        <div className="tp-popup__inner" data-react-owned="">
          <div className="tp-popup__header">
            <div className="tp-popup__header-text">
              <h4 className="subsection-header-title">{t(labelKey)}</h4>
              <p className="subsection-header-subtitle secondary">{t(subtitleKey)}</p>
            </div>
            <button type="button" className="tp-popup__switch">
              {!isFrom && <i className="hgi-stroke hgi-arrow-left-01" aria-hidden="true" />}
              <span className="tp-switch__label">
                {t(isFrom ? "form.toTitle" : "form.fromTitle")}
              </span>
              {isFrom && <i className="hgi-stroke hgi-arrow-right-01" aria-hidden="true" />}
            </button>
          </div>
          <div className="tp-popup__input-wrap">
            <i className="hgi-stroke hgi-clock-01 tp-popup__clock" aria-hidden="true" />
            <input
              ref={inputRef}
              type="time"
              id={input.id}
              name={input.name}
              min={input.min}
              max={input.max}
              defaultValue={input.value}
              className="tp-popup__time-input"
            />
          </div>
          <div className="tp-popup__step-btns">
            <button
              type="button"
              className="tp-popup__step button-primary button-secondary tp-step-minus"
            >
              <i className="hgi-stroke hgi-remove-01" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="tp-popup__step button-primary button-secondary tp-step-plus"
            >
              <i className="hgi-stroke hgi-add-01" aria-hidden="true" />
            </button>
          </div>
          <div className="tp-popup__quick-btns">
            {isFrom && (
              <button type="button" className="tp-popup__quick button-primary tp-quick-now">
                <i className="hgi-stroke hgi-navigation-03" aria-hidden="true" />
                <span className="tp-text-node">{t("timepicker.now")}</span>
              </button>
            )}
            <button type="button" className="tp-popup__quick button-primary tp-quick-preset">
              <i className="hgi-stroke hgi-clock-01" aria-hidden="true" />
              <span className="tp-quick-label">{quickLabel}</span>
            </button>
          </div>
          <button type="button" className="tp-popup__done button-primary">
            <i className="hgi-stroke hgi-tick-02" aria-hidden="true" />
            <span className="tp-text-node">{t("timepicker.done")}</span>
          </button>
        </div>,
        popup,
      )}
    </>
  );
}

export function getPickerCards() {
  const cards = [..._allCards];

  return {
    fromCard: cards.find((card) => card._isFrom) ?? null,
    toCard: cards.find((card) => !card._isFrom) ?? null,
  };
}
