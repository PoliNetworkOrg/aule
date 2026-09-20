// Search overlay — the bottom-nav search FAB opens this as a sheet over
// whatever tab is currently showing, rather than switching to its own tab
// page. It owns only the presentation/UX; the actual classroom text search
// (data, index, card builders) lives in classroom-search-data.ts.

import { onLanguageSwitch } from "../i18n.ts";
import { haptics, defaultPatterns } from "./haptics.ts";
import { ensureSearchData, hasOccupationData } from "../classroom-search-data";

const DEBOUNCE_MS = 200;

// Shared view-transition name: the bottom-nav search FAB morphs into the
// overlay's search bar on open, and back on close. Only ever assigned to one
// of the two elements at a time (cleared before it's handed over).
const MORPH_NAME = "search-fab-morph";

let openMounted: (() => Promise<void>) | null = null;

let closeMounted: (() => void) | null = null;

export async function openSearchOverlay() {
  await openMounted?.();
}

export function closeSearchOverlay() {
  closeMounted?.();
}

export function initSearchOverlay(renderQuery: (query: string) => void) {
  const events = new AbortController();
  const frames = new Set<number>();
  const timers = new Set<number>();

  const frame = (callback: FrameRequestCallback) => {
    const id = requestAnimationFrame((time) => {
      frames.delete(id);
      callback(time);
    });

    frames.add(id);

    return id;
  };

  const later = (callback: () => void, delay: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      callback();
    }, delay);

    timers.add(id);

    return id;
  };

  let disposed = false;
  const fabEl = () => document.getElementById("bn-search-btn");

  const barEl = () => overlay.querySelector<HTMLElement>(".search-bar-wrapper");

  // The translucent chrome (header blur layers, pill nav) can't keep a live
  // backdrop-filter through a view transition — Safari doesn't rasterise it into
  // the snapshot, so it flashes unblurred / resamples the wrong backdrop. While
  // `html.search-vt` is set (only for the duration of the open/close VT) those
  // surfaces drop their blur — see search-overlay.css.
  function beginChromeVT() {
    document.documentElement.classList.add("search-vt");
  }

  // Restore the blur a couple of frames AFTER the VT resolves — snapping it back
  // while the ::view-transition pseudo-elements are still tearing down double-
  // exposes the FAB (unblurred snapshot + freshly-blurred live element).
  function endChromeVT() {
    frame(() =>
      frame(() => {
        document.documentElement.classList.remove("search-vt");
      }),
    );
  }

  const overlay = document.getElementById("search-overlay")!;
  const panel = overlay.querySelector<HTMLElement>(".search-overlay-panel")!;
  const input = document.querySelector<HTMLInputElement>("#classroom-search-input")!;
  const clearBtn = document.getElementById("classroom-search-clear")!;
  const closeBtn = document.getElementById("search-overlay-close")!;
  const resultsEl = document.getElementById("search-overlay-results")!;

  let isOpen = false;

  let debounce = 0;

  let savedScrollPos = 0;

  let occRecheckTimer = 0;

  function renderResults(query: string) {
    renderQuery(query);
    clearTimeout(occRecheckTimer);

    if (query.trim() && !hasOccupationData()) scheduleOccRecheck(query);
    frame(syncHeaderClearance);
  }

  function scheduleOccRecheck(query: string, tries = 0) {
    clearTimeout(occRecheckTimer);

    if (tries > 6) return;
    occRecheckTimer = later(() => {
      if (!isOpen || input.value !== query) return;

      if (hasOccupationData()) renderResults(query);
      else scheduleOccRecheck(query, tries + 1);
    }, 1200);
  }

  // Hide the header only once the results box has actually grown tall enough to
  // reach up behind it (body.search-covers-header, consumed by the mobile CSS).
  // opacity:0 on the header doesn't change its box, so this can't oscillate.
  function syncHeaderClearance() {
    const header = document.querySelector(".header");

    if (!header || !panel || !isOpen) return;
    const covers = panel.getBoundingClientRect().top < header.getBoundingClientRect().bottom + 8;
    document.body.classList.toggle("search-covers-header", covers);
  }

  // Mobile pins the search field just above the on-screen keyboard. iOS Safari
  // doesn't shrink the layout viewport for the keyboard, so `position: fixed;
  // bottom` alone would sit behind it — track visualViewport and expose the
  // keyboard height as --search-kb for the CSS to offset by.
  function onViewportResize() {
    const vv = window.visualViewport;

    if (!vv) return;
    const kb = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    overlay.style.setProperty("--search-kb", kb + "px");
    frame(syncHeaderClearance);
  }

  function startViewportTracking() {
    const vv = window.visualViewport;

    if (!vv) return;
    onViewportResize();
    vv.addEventListener("resize", onViewportResize, { signal: events.signal });
    vv.addEventListener("scroll", onViewportResize, { signal: events.signal });
  }

  function stopViewportTracking() {
    const vv = window.visualViewport;

    if (vv) {
      vv.removeEventListener("resize", onViewportResize);
      vv.removeEventListener("scroll", onViewportResize);
    }

    overlay.style.removeProperty("--search-kb");
  }

  function conceal() {
    overlay.classList.remove("visible");
    overlay.setAttribute("hidden", "");
    document.body.classList.remove("search-overlay-open");
    document.body.classList.remove("search-covers-header");
    clearTimeout(occRecheckTimer);
    stopViewportTracking();
    window.scrollTo(0, savedScrollPos);
  }

  // Land the caret in the field ready to type; select any leftover query so the
  // first keystroke replaces it. Must run inside the FAB-tap callstack — iOS
  // Safari only opens the keyboard for a focus() that's user-initiated.
  function grabInput() {
    input.focus({ preventScroll: true });
    input.select();
  }

  async function open() {
    if (isOpen || !overlay) return;
    isOpen = true;
    haptics.trigger(defaultPatterns.light);
    savedScrollPos = window.scrollY;

    // Unhide + focus synchronously (still inside the FAB-tap callstack, so iOS
    // opens the keyboard). The overlay is only opacity:0 here, not display:none,
    // so focus() works. `search-overlay-open` (which hides the FAB/nav) is held
    // back until inside the VT callback so the FAB stays in the "old" snapshot
    // to morph from. The panel rides above the keyboard via the visualViewport
    // tracking below, so it doesn't matter that Safari resizes late.
    overlay.removeAttribute("hidden");
    grabInput();

    const fab = fabEl();

    if (document.startViewTransition && fab) {
      fab.style.viewTransitionName = MORPH_NAME;
      beginChromeVT();

      const vt = document.startViewTransition(() => {
        if (disposed) return;
        fab.style.viewTransitionName = "";
        document.body.classList.add("search-overlay-open");
        overlay.classList.add("visible");
        startViewportTracking();
        const bar = barEl();

        if (bar) bar.style.viewTransitionName = MORPH_NAME;
      });

      vt.finished.finally(() => {
        if (disposed) return;
        const bar = barEl();

        if (bar) bar.style.viewTransitionName = "";
        endChromeVT();

        // Re-grab only if the transition stole focus (some engines blur on the
        // DOM churn); avoids yanking the selection back if the user's already typing.
        if (isOpen && document.activeElement !== input) grabInput();
      });
    } else {
      document.body.classList.add("search-overlay-open");
      frame(() => overlay.classList.add("visible"));
      startViewportTracking();
      grabInput();
    }

    await ensureSearchData();

    if (isOpen) renderResults(input.value);
  }

  function close() {
    if (!isOpen || !overlay) return;
    isOpen = false;
    clearTimeout(debounce);
    input.blur();

    const fab = fabEl();

    if (document.startViewTransition && fab) {
      const bar = barEl();

      if (bar) bar.style.viewTransitionName = MORPH_NAME;
      beginChromeVT();

      const vt = document.startViewTransition(() => {
        if (disposed) return;

        if (bar) bar.style.viewTransitionName = "";
        conceal();
        fab.style.viewTransitionName = MORPH_NAME;
      });

      vt.finished.finally(() => {
        if (disposed) return;
        fab.style.viewTransitionName = "";
        endChromeVT();
      });
    } else {
      overlay.classList.remove("visible");
      const done = () => conceal();
      overlay.addEventListener("transitionend", done, { once: true, signal: events.signal });
      later(done, 260); // fallback if transitionend doesn't fire
    }
  }

  // Drop the overlay with no transition of its own — for when the click that
  // dismisses it also navigates somewhere that runs its own transition (info
  // page, classroom detail), so the two don't fight.
  function dismissInstant() {
    if (!isOpen) return;
    isOpen = false;
    clearTimeout(debounce);
    input.blur();
    const fab = fabEl();

    if (fab) fab.style.viewTransitionName = "";
    document.documentElement.classList.remove("search-vt");
    conceal();
  }

  closeBtn.addEventListener(
    "click",
    () => {
      haptics.trigger(defaultPatterns.light);
      close();
    },
    { signal: events.signal },
  );

  // Tap the blurred backdrop (outside the panel) to dismiss.
  overlay.addEventListener(
    "click",
    (e) => {
      if (e.target instanceof Node && !panel.contains(e.target)) close();
    },
    { signal: events.signal },
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (isOpen && e.key === "Escape") close();
    },
    { signal: events.signal },
  );

  // Opening a result navigates to the classroom detail page — get the
  // overlay out of the way so the card → page morph isn't behind the blur.
  resultsEl.addEventListener(
    "click",
    (e) => {
      if (e.target instanceof Element && e.target.closest("[data-open-classroom]")) close();
    },
    { signal: events.signal },
  );

  // The header sits above the overlay (z-index), so its controls stay
  // clickable while search is open. Any such click (info page, settings, …)
  // should take the overlay down first — the destination runs its own
  // transition. Capture phase so this beats the buttons' own handlers.
  document.querySelector(".header")?.addEventListener(
    "click",
    () => {
      if (isOpen) dismissInstant();
    },
    { capture: true, signal: events.signal },
  );

  // Safety net: any other hash route opened while we're open takes it down too
  // (isOpen is already false by here for the result-card path above).
  window.addEventListener(
    "poliaule:routechange",
    () => {
      if (isOpen && location.hash) dismissInstant();
    },
    { signal: events.signal },
  );

  clearBtn.addEventListener(
    "click",
    () => {
      haptics.trigger(defaultPatterns.light);
      input.value = "";
      input.dispatchEvent(new Event("input"));
      input.focus();
    },
    { signal: events.signal },
  );

  input.addEventListener(
    "input",
    () => {
      clearTimeout(debounce);
      const query = input.value;

      if (!query.trim()) {
        renderResults("");

        return;
      }

      debounce = later(() => renderResults(query), DEBOUNCE_MS);
    },
    { signal: events.signal },
  );

  const stopLanguage = onLanguageSwitch(() => {
    if (isOpen) renderResults(input.value);
  });

  openMounted = open;
  closeMounted = close;

  return () => {
    disposed = true;
    openMounted = null;
    closeMounted = null;
    isOpen = false;
    events.abort();
    frames.forEach(cancelAnimationFrame);
    timers.forEach(clearTimeout);
    stopLanguage();
    clearTimeout(debounce);
    clearTimeout(occRecheckTimer);
    stopViewportTracking();
    document.body.classList.remove("search-overlay-open", "search-covers-header");
    document.documentElement.classList.remove("search-vt");
  };
}
