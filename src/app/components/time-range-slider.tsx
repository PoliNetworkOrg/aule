import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { observeInputProperty } from "./time-input";
// components/time-range-slider.js
// Horizontal drag-based time range selector. Replaces the two-card picker UI
// as the primary input; tapping a badge opens the morph popup for typed entry.

import { openPicker, getPickerCards } from "./time-picker";
import { createTimeFormatter } from "../utils/time-format.ts";
import { romeMinutesOfDay } from "../available-rooms-script.ts";
import { t } from "../i18n.ts";

const SNAP = 60; // one-hour grid — snaps only to HH:15 marks

const DRAG_THRESHOLD = 4; // px of movement before a tap becomes a drag

function toHHMM(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function timeToMinutes(str: string) {
  if (!str) return 0;
  const [h, m] = str.split(":").map(Number);

  return h * 60 + m;
}

function formatMinutes(minutes: number) {
  const d = new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);

  return createTimeFormatter({ hour: "numeric", minute: "2-digit" }).format(d);
}

function snapTo(m: number) {
  // Snap to nearest HH:15 mark (08:15, 09:15, …)
  return Math.round((m - 15) / 60) * 60 + 15;
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  if (h === 0) return `${m}m`;

  if (m === 0) return `${h}h`;

  return `${h}h ${m}m`;
}

export function TimeRangeSlider({
  fromInput,
  toInput,
  renderRef,
}: {
  fromInput: HTMLInputElement;
  toInput: HTMLInputElement;
  renderRef: RefObject<(() => void) | null>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState({ from: "", to: "", duration: "" });
  const [, setFormatRevision] = useState(0);
  const [nowLabel] = useState(() => t("timepicker.now"));
  const minimum = timeToMinutes(fromInput.min || "07:15");
  const maximum = timeToMinutes(fromInput.max || "20:15");
  const total = maximum - minimum;
  const percent = (minutes: number) => `${(((minutes - minimum) / total) * 100).toFixed(2)}%`;
  const marks: number[] = [];
  const ticks: number[] = [];
  const interval = [15, 20, 30, 45, 60, 90, 120].find((division) => division >= total / 6) ?? 120;
  let previous = -Infinity;

  for (let minute = Math.ceil((minimum - 15) / 60) * 60 + 15; minute <= maximum; minute += 60) {
    if (minute < maximum) marks.push(minute);

    if (
      minute - minimum >= 20 &&
      maximum - minute >= 20 &&
      minute - previous >= Math.round(interval * 0.75)
    ) {
      ticks.push(minute);
      previous = minute;
    }
  }

  useLayoutEffect(() => {
    const wrapper = root.current;

    if (!wrapper) return;
    const MIN = timeToMinutes(fromInput.getAttribute("min") || "07:15");
    const MAX = timeToMinutes(fromInput.getAttribute("max") || "20:15");
    const TOTAL = MAX - MIN;

    let fromMin = timeToMinutes(fromInput.value) || MIN;
    let toMin = timeToMinutes(toInput.value) || fromMin + 120;

    if (toMin > MAX) {
      toMin = MAX;
      fromMin = Math.max(MIN, toMin - Math.max(60, toMin - fromMin));
    }

    const events = new AbortController();
    const signal = events.signal;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const schedule = (callback: () => void, delay: number) => {
      timers.push(setTimeout(callback, delay));
    };

    const fromBadge = wrapper.querySelector<HTMLButtonElement>(".trs-badge--from")!;
    const toBadge = wrapper.querySelector<HTMLButtonElement>(".trs-badge--to")!;
    const fromText = fromBadge.querySelector("span")!;
    const toText = toBadge.querySelector("span")!;
    const bar = wrapper.querySelector<HTMLElement>(".trs-bar")!;
    const range = wrapper.querySelector<HTMLElement>(".trs-range")!;
    const durationEl = wrapper.querySelector<HTMLElement>(".trs-duration")!;
    const fromHandle = wrapper.querySelector<HTMLElement>(".trs-handle--from")!;
    const toHandle = wrapper.querySelector<HTMLElement>(".trs-handle--to")!;
    const nowBadge = wrapper.querySelector<HTMLElement>(".trs-now-badge")!;
    const nowLine = wrapper.querySelector<HTMLElement>(".trs-now-line")!;
    // ── Geometry helpers ──────────────────────────────────────────────────────

    function pct(m: number) {
      return `${(((m - MIN) / TOTAL) * 100).toFixed(2)}%`;
    }

    // The bar's rect is measured once when a drag starts and reused for
    // every pointermove of that gesture: the bar doesn't move while it's
    // being dragged, and re-measuring it after each move's style writes
    // forced a synchronous layout per pointer sample.
    let gestureRect: DOMRect | null = null;

    function barRect() {
      return gestureRect ?? bar.getBoundingClientRect();
    }

    function xToMinutes(clientX: number) {
      const rect = barRect();

      if (!rect.width) return fromMin;

      return MIN + Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * TOTAL;
    }

    // ── Render ────────────────────────────────────────────────────────────────

    function updateBadgeText(el: HTMLElement, newText: string) {
      if (el.textContent === newText) return;
      el.classList.remove("trs-badge-text--changing");
      void el.offsetWidth;
      el.classList.add("trs-badge-text--changing");
    }

    // The committed (snapped) values the text/ARIA side of the last render
    // reflected. Mid-drag the visual positions change every pointer sample
    // but these only change on a snap, so the label re-render and the four
    // attribute writes are skipped on the frames in between.
    let renderedFrom = NaN;
    let renderedTo = NaN;

    function render(vFrom = fromMin, vTo = toMin) {
      const committedChanged = fromMin !== renderedFrom || toMin !== renderedTo;
      const fromLabel = formatMinutes(fromMin);
      const toLabel = formatMinutes(toMin);

      if (committedChanged) {
        updateBadgeText(fromText, fromLabel);
        updateBadgeText(toText, toLabel);
      }

      fromBadge.style.left = pct(vFrom);
      toBadge.style.left = pct(vTo);

      const duration = toMin - fromMin;
      const rangePct = ((vTo - vFrom) / TOTAL) * 100;
      range.style.left = pct(vFrom);
      range.style.width = `${rangePct.toFixed(2)}%`;

      // Show duration label only when the range is wide enough to fit it
      const barWidth = barRect().width;
      const rangePixels = (rangePct / 100) * barWidth;

      if (committedChanged) {
        setLabels((current) => {
          const next = {
            from: fromLabel,
            to: toLabel,
            duration: formatDuration(duration),
          };

          return current.from === next.from &&
            current.to === next.to &&
            current.duration === next.duration
            ? current
            : next;
        });
      }

      durationEl.style.display = rangePixels > 48 ? "" : "none";

      fromHandle.style.left = pct(vFrom);
      toHandle.style.left = pct(vTo);

      if (committedChanged) {
        fromHandle.setAttribute("aria-valuenow", String(fromMin));
        fromHandle.setAttribute("aria-valuetext", fromLabel);
        toHandle.setAttribute("aria-valuenow", String(toMin));
        toHandle.setAttribute("aria-valuetext", toLabel);
        renderedFrom = fromMin;
        renderedTo = toMin;
      }
    }

    function updateNowPosition() {
      const n = romeMinutesOfDay();
      const inRange = n > MIN && n < MAX;
      nowBadge.style.display = inRange ? "" : "none";
      nowLine.style.display = inRange ? "" : "none";

      if (inRange) {
        nowBadge.style.left = pct(n);
        nowLine.style.left = pct(n);
      }
    }

    updateNowPosition();
    const nowTimer = setInterval(updateNowPosition, 60_000);

    nowBadge.addEventListener(
      "click",
      () => {
        const currentNow = romeMinutesOfDay();
        const duration = toMin - fromMin;
        let newFrom = Math.max(MIN, Math.min(snapTo(currentNow), MAX));
        let newTo = newFrom + duration;

        if (newTo > MAX) {
          newTo = MAX;
          newFrom = Math.max(MIN, newTo - Math.max(60, duration));
        }

        fromMin = newFrom;
        toMin = newTo;
        syncInputs();
        bar.classList.add("trs-bar--snapping");
        render();
        schedule(() => bar.classList.remove("trs-bar--snapping"), 300);
      },
      { signal },
    );

    // ── Input sync ────────────────────────────────────────────────────────────

    let _syncing = false;

    function syncInputs() {
      _syncing = true;
      fromInput.value = toHHMM(fromMin);
      toInput.value = toHHMM(toMin);
      _syncing = false;
      // Input events let setupTimePickers enforce its constraints (min gap, etc.)
      fromInput.dispatchEvent(new Event("input", { bubbles: true }));
      toInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // Chain onto whatever descriptor time-picker.js already installed so the
    // morph popup display stays in sync when external code sets .value.
    const restoreFrom = observeInputProperty(fromInput, "value", (value) => {
      if (!_syncing && value) {
        fromMin = timeToMinutes(value);
        render();
      }
    });

    const restoreTo = observeInputProperty(toInput, "value", (value) => {
      if (!_syncing && value) {
        toMin = timeToMinutes(value);
        render();
      }
    });

    // ── Drag ─────────────────────────────────────────────────────────────────

    let dragMode: "from" | "to" | "pan" | null = null; // 'from' | 'to' | 'pan' | null
    let panAnchorX = 0;
    let panAnchorFrom = 0;
    let panAnchorTo = 0;
    let pointerDownX = 0;
    let didDrag = false;

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0 && e.pointerType !== "touch") return;
      e.preventDefault();
      pointerDownX = e.clientX;
      didDrag = false;

      gestureRect = bar.getBoundingClientRect();
      const rect = gestureRect;
      const rawM = xToMinutes(e.clientX);

      const fromPx = ((fromMin - MIN) / TOTAL) * rect.width + rect.left;
      const toPx = ((toMin - MIN) / TOTAL) * rect.width + rect.left;
      const hitPx = Math.max(20, Math.min(36, rect.width * 0.05));

      const dFrom = Math.abs(e.clientX - fromPx);
      const dTo = Math.abs(e.clientX - toPx);

      if (dFrom <= hitPx && dFrom <= dTo) {
        dragMode = "from";

        fromHandle.classList.add("trs-handle--dragging");
        fromBadge.classList.add("trs-badge--dragging");
      } else if (dTo <= hitPx) {
        dragMode = "to";

        toHandle.classList.add("trs-handle--dragging");
        toBadge.classList.add("trs-badge--dragging");
      } else if (rawM >= fromMin - SNAP * 0.5 && rawM <= toMin + SNAP * 0.5) {
        dragMode = "pan";
        panAnchorX = e.clientX;
        panAnchorFrom = fromMin;
        panAnchorTo = toMin;

        fromBadge.classList.add("trs-badge--dragging");
        toBadge.classList.add("trs-badge--dragging");
      } else {
        return;
      }

      bar.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: PointerEvent) {
      if (!dragMode) return;

      if (!didDrag && Math.abs(e.clientX - pointerDownX) > DRAG_THRESHOLD) didDrag = true;

      if (!didDrag) return;

      const rawM = xToMinutes(e.clientX);
      let vFrom = fromMin;
      let vTo = toMin;

      if (dragMode === "from") {
        // vFrom (unsnapped, clamped) drives the smooth "follow the pointer"
        // render below; fromMin (the committed value synced to the input) is
        // computed separately by snapping *then* clamping — snapping the raw
        // position first and clamping second can overshoot the clamp by up
        // to SNAP/2 (e.g. when the other handle sits off the :15 grid after
        // being set via the typed-entry popup), which could otherwise leave
        // the two handles momentarily closer together than the intended
        // 1-hour gap.
        vFrom = Math.max(MIN, Math.min(rawM, toMin - SNAP));
        const snapped = Math.max(MIN, Math.min(snapTo(rawM), toMin - SNAP));

        if (snapped !== fromMin) {
          fromMin = snapped;
          syncInputs();
        }
      } else if (dragMode === "to") {
        vTo = Math.max(fromMin + SNAP, Math.min(rawM, MAX));
        const snapped = Math.max(fromMin + SNAP, Math.min(snapTo(rawM), MAX));

        if (snapped !== toMin) {
          toMin = snapped;
          syncInputs();
        }
      } else {
        const rect = barRect();
        const deltaM = ((e.clientX - panAnchorX) / rect.width) * TOTAL;
        vFrom = panAnchorFrom + deltaM;
        vTo = panAnchorTo + deltaM;

        const duration = panAnchorTo - panAnchorFrom;

        if (vFrom < MIN) {
          vFrom = MIN;
          vTo = MIN + duration;
        } else if (vTo > MAX) {
          vTo = MAX;
          vFrom = MAX - duration;
        }

        const snappedF = snapTo(vFrom);
        const snappedT = snappedF + duration;

        if (snappedF !== fromMin && snappedT <= MAX && snappedF >= MIN) {
          fromMin = snappedF;
          toMin = snappedT;
          syncInputs();
        }
      }

      render(vFrom, vTo);
    }

    function onPointerUp() {
      gestureRect = null;

      if (!dragMode) return;
      fromHandle.classList.remove("trs-handle--dragging");
      toHandle.classList.remove("trs-handle--dragging");
      fromBadge.classList.remove("trs-badge--dragging");
      toBadge.classList.remove("trs-badge--dragging");

      const wasDrag = didDrag;
      const endedDragMode = dragMode;
      dragMode = null;
      didDrag = false;

      // Animate snap back to logical values
      bar.classList.add("trs-bar--snapping");
      render();
      schedule(() => {
        bar.classList.remove("trs-bar--snapping");
      }, 300);

      if (wasDrag) {
        // Reflect any corrections applied by setupTimePickers' input listeners
        const cFrom = timeToMinutes(fromInput.value);
        const cTo = timeToMinutes(toInput.value);

        if (cFrom !== fromMin || cTo !== toMin) {
          fromMin = cFrom;
          toMin = cTo;
          render();
        }
      } else {
        // Tap (no significant movement) — open popup for the tapped handle

        if (endedDragMode === "from") openFrom();
        else if (endedDragMode === "to") openTo();
      }
    }

    bar.addEventListener("pointerdown", onPointerDown, { signal });
    bar.addEventListener("pointermove", onPointerMove, { signal });
    bar.addEventListener("pointerup", onPointerUp, { signal });
    bar.addEventListener("pointercancel", onPointerUp, { signal });

    // ── Tap badge / handle → open morph popup ────────────────────────────────

    function openFrom() {
      const { fromCard } = getPickerCards();

      if (!fromCard) return;
      fromCard._sourceRect = fromBadge.getBoundingClientRect();
      openPicker(fromCard, fromCard._sourceRect);
    }

    function openTo() {
      const { toCard } = getPickerCards();

      if (!toCard) return;
      toCard._sourceRect = toBadge.getBoundingClientRect();
      openPicker(toCard, toCard._sourceRect);
    }

    fromBadge.addEventListener(
      "click",
      () => {
        openFrom();
      },
      { signal },
    );
    toBadge.addEventListener(
      "click",
      () => {
        openTo();
      },
      { signal },
    );

    // ── Keyboard ──────────────────────────────────────────────────────────────

    fromHandle.addEventListener(
      "keydown",
      (e) => {
        const step = e.shiftKey ? 60 : SNAP;

        if (e.key === "ArrowLeft") {
          fromMin = Math.max(MIN, fromMin - step);
          render();
          syncInputs();
          e.preventDefault();
        } else if (e.key === "ArrowRight") {
          fromMin = Math.min(toMin - SNAP, fromMin + step);
          render();
          syncInputs();
          e.preventDefault();
        } else if (e.key === "Enter" || e.key === " ") {
          openFrom();
          e.preventDefault();
        }
      },
      { signal },
    );

    toHandle.addEventListener(
      "keydown",
      (e) => {
        const step = e.shiftKey ? 60 : SNAP;

        if (e.key === "ArrowLeft") {
          toMin = Math.max(fromMin + SNAP, toMin - step);
          render();
          syncInputs();
          e.preventDefault();
        } else if (e.key === "ArrowRight") {
          toMin = Math.min(MAX, toMin + step);
          render();
          syncInputs();
          e.preventDefault();
        } else if (e.key === "Enter" || e.key === " ") {
          openTo();
          e.preventDefault();
        }
      },
      { signal },
    );

    // ── Re-render on locale change ─────────────────────────────────────────────

    window.addEventListener(
      "timeformatchange",
      () => {
        setFormatRevision((revision) => revision + 1);
        // Same values, new formatting — force the label/ARIA side to redo.
        renderedFrom = NaN;
        renderedTo = NaN;
        render();
      },
      { signal },
    );

    render();

    renderRef.current = render;
    const observer = new ResizeObserver(() => render());
    observer.observe(bar);

    const frame = requestAnimationFrame(() => {
      render();
      const { fromCard, toCard } = getPickerCards();

      if (fromCard) fromCard._sourceRect = fromBadge.getBoundingClientRect();

      if (toCard) toCard._sourceRect = toBadge.getBoundingClientRect();
    });

    return () => {
      events.abort();
      observer.disconnect();
      clearInterval(nowTimer);
      cancelAnimationFrame(frame);

      for (const timer of timers) clearTimeout(timer);
      renderRef.current = null;
      restoreTo();
      restoreFrom();
    };
  }, [fromInput, toInput, renderRef]);

  return (
    <div ref={root} className="trs-wrapper" data-react-owned="">
      <div className="trs-title" aria-hidden="true">
        <i className="hgi-stroke hgi-clock-01 trs-title-icon" />
        <span className="trs-title-text" data-i18n="timepicker.timeLabel">
          {t("timepicker.timeLabel")}
        </span>
      </div>
      <div className="trs-bar-wrapper">
        <button type="button" className="trs-badge trs-badge--from" aria-label="Edit start time">
          <span>{labels.from}</span>
        </button>
        <button type="button" className="trs-badge trs-badge--to" aria-label="Edit end time">
          <span>{labels.to}</span>
        </button>
        <div className="trs-bar">
          <div className="trs-range">
            <span className="trs-duration">{labels.duration}</span>
          </div>
          <div
            className="trs-handle trs-handle--from"
            tabIndex={0}
            role="slider"
            aria-label="Start time"
            aria-valuemin={minimum}
            aria-valuemax={maximum}
          />
          <div
            className="trs-handle trs-handle--to"
            tabIndex={0}
            role="slider"
            aria-label="End time"
            aria-valuemin={minimum}
            aria-valuemax={maximum}
          />
          {marks.map((minute) => (
            <div key={minute} className="trs-grid-line" style={{ left: percent(minute) }} />
          ))}
          <div className="trs-now-line" />
        </div>
        <div className="trs-ticks">
          {ticks.map((minute) => (
            <div
              key={minute}
              className="trs-tick-label"
              style={{ left: percent(minute) }}
              data-time-minutes={minute}
            >
              {formatMinutes(minute)}
            </div>
          ))}
        </div>
        <div className="trs-now-badge">{nowLabel}</div>
      </div>
    </div>
  );
}
