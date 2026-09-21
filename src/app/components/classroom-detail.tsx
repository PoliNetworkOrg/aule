import {
  Children,
  Fragment,
  createRef,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import type { Campus, ClassroomEntry, Occupation, OccupancyDay } from "../types";
import type { PillSelection } from "vitrium";
import { FilledStar } from "./classroom-card";

type VariableStyle = CSSProperties & { [key: `--${string}`]: string | number };

function cssVars(style: VariableStyle) {
  return style;
}

interface QueryContext {
  date: string;
  from: string;
  to: string;
}

interface ScheduleHighlight {
  date: string;
  from: string;
  to: string;
  professors: string[];
}

interface OpenTrigger {
  cardEl: HTMLElement;
  queryContext: QueryContext | null;
  highlight: ScheduleHighlight | null;
}

interface PhotoState {
  visible: boolean;
  gradient: boolean;
  url?: string;
  loaded: boolean;
}

interface PhotoHandle {
  show(): void;
  hide(): void;
  reveal(url: string): void;
  load(url: string): HTMLImageElement | null;
}

function DetailPhoto({ ref }: { ref: Ref<PhotoHandle> }) {
  const [photo, setPhoto] = useState<PhotoState>({ visible: true, gradient: true, loaded: false });
  const img = useRef<HTMLImageElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      show() {
        flushSync(() =>
          setPhoto((current) =>
            current.visible ? current : { visible: true, gradient: false, loaded: false },
          ),
        );
      },
      hide() {
        flushSync(() => setPhoto((current) => ({ ...current, visible: false })));
      },
      reveal(url) {
        flushSync(() => setPhoto((current) => ({ ...current, url, loaded: true })));
      },
      load(url) {
        flushSync(() => setPhoto((current) => ({ ...current, url })));

        return img.current;
      },
    }),
    [],
  );

  if (!photo.visible) return null;

  return (
    <div className={`detail-photo-container${photo.loaded ? " loaded" : ""}`}>
      <img
        ref={img}
        className={`detail-photo${photo.loaded ? " loaded" : ""}`}
        alt=""
        src={photo.url}
        onError={() => setPhoto((current) => ({ ...current, visible: false }))}
      />
      {photo.gradient && <div className="detail-photo-gradient" />}
    </div>
  );
}

import { openPage, closePage, goBack } from "../../lib/navigation";
import {
  classroomsData as occupancyData,
  SKIP_DAYS,
  getClassroomStatusNow,
} from "../available-rooms-script.ts";
import { t, getLocale, onLanguageSwitch } from "../i18n.ts";
import { createTimeFormatter } from "../utils/time-format.ts";
import { infoPage } from "./info-page.tsx";
import { fetchPhotoUrl, photoUrlCache } from "../utils/photo.ts";
import { isFavourite, toggleFavourite } from "../utils/favourites.ts";
import { createPopover } from "vitrium";
import { createPillSelector } from "./pill-selector.ts";

function minutesToTimeDisplay(minutes: number) {
  const d = new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);

  return createTimeFormatter({ hour: "numeric", minute: "2-digit" }).format(d);
}

// ---------- CONSTANTS ----------

const FEATURE_ICONS = new Map(
  Object.entries({
    4: { icon: "hgi-projector-01", key: "features.videoProjector" },
    5: { icon: "hgi-mic-01", key: "features.radioMic" },
    6: { icon: "hgi-blinds", key: "features.dimmable" },
    7: { icon: "hgi-cable", key: "features.wiredDesk" },
    142: { icon: "hgi-plug-socket", key: "features.powerOutlets" },
    223: { icon: "hgi-computer-video-call", key: "features.videoconf" },
  }),
);

function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);

  return h * 60 + m;
}

// Builds the popover body for a single occupancy slot. Course/exam slots carry
// structured fields (course, code, professors, section); anything the scrape
// couldn't parse only has `raw`; very old cached data may only have `name`.
function OccupationPopover({ slot }: { slot: Occupation }) {
  const timeRange = `${minutesToTimeDisplay(timeToMinutes(slot.inizio))} – ${minutesToTimeDisplay(timeToMinutes(slot.fine))}`;

  let titleText;
  const metaLines: ReactNode[] = [];

  if (slot.category === "COURSE" || slot.category === "EXAM") {
    titleText = slot.course ?? slot.name ?? t("detail.occupied");

    if (slot.category === "EXAM") {
      metaLines.push(
        <>
          <span className={"timeline-popover-badge"}>{t("detail.examLabel")}</span>
        </>,
      );
    }

    if (slot.code != null)
      metaLines.push(
        <>
          <span>{String(slot.code)}</span>
        </>,
      );

    if (slot.section)
      metaLines.push(
        <>
          <span>{slot.section}</span>
        </>,
      );

    if (Array.isArray(slot.professors) && slot.professors.length) {
      metaLines.push(
        <>
          <span>{slot.professors.join(", ")}</span>
        </>,
      );
    }
  } else {
    titleText = slot.raw ?? slot.name ?? t("detail.occupied");
  }

  return (
    <>
      <div className={"timeline-popover-time"}>{timeRange}</div>
      <div className={"timeline-popover-title"}>{titleText}</div>
      {metaLines.length ? (
        <>
          <div className={"timeline-popover-meta"}>{Children.toArray(metaLines)}</div>
        </>
      ) : (
        ""
      )}
    </>
  );
}

class ClassroomDetail {
  _overlay: HTMLElement | null = null;
  _tabbar: HTMLElement | null = null;
  _backBtn: HTMLElement | null = null;
  _favBtn: HTMLElement | null = null;
  _staticData: Campus[] | null = null;
  _flatIndex: Map<number, ClassroomEntry> | null = null;
  _slugIndex: Map<string, ClassroomEntry> | null = null;
  _pendingTrigger: OpenTrigger | null = null;
  _openTrigger: OpenTrigger | null = null;
  _openedViaPushState = false;
  _currentId: number | null = null;
  _savedScrollPos = 0;
  _queryContext: QueryContext | null = null;
  _highlight: ScheduleHighlight | null = null;
  _highlightConsumed = false;
  _nowTimer: number | undefined;
  _timelinePopoverCleanup: (() => void) | null = null;
  _root: Root | null = null;
  _favRoot: Root | null = null;
  _scheduleRoot: Root | null = null;
  _photo = createRef<PhotoHandle>();
  _revision = 0;
  _scheduleRevision = 0;
  _events = new AbortController();
  _contentEvents = new AbortController();
  _scheduleEvents = new AbortController();
  _stopLanguage: (() => void) | null = null;
  _timers = new Set<number>();
  _frames = new Set<number>();
  _disposed = false;
  _generation = 0;
  _frame(callback: () => void) {
    const id = requestAnimationFrame(() => {
      this._frames.delete(id);
      callback();
    });

    this._frames.add(id);

    return id;
  }
  _later(callback: () => void, delay: number) {
    const id = window.setTimeout(() => {
      this._timers.delete(id);
      callback();
    }, delay);

    this._timers.add(id);

    return id;
  }
  _clearSchedule() {
    clearInterval(this._nowTimer);
    this._scheduleEvents.abort();
    this._timelinePopoverCleanup?.();
    this._timelinePopoverCleanup = null;
    this._scheduleRoot?.unmount();
    this._scheduleRoot = null;
  }
  _clearContent() {
    this._clearSchedule();
    this._contentEvents.abort();
    flushSync(() => this._root?.render(null));
  }
  destroy() {
    this._generation++;
    this._pendingTrigger = null;
    this._openTrigger = null;
    this._queryContext = null;
    this._highlight = null;
    this._openedViaPushState = false;
    this._disposed = true;
    this._events.abort();
    this._contentEvents.abort();
    this._scheduleEvents.abort();
    this._stopLanguage?.();
    clearInterval(this._nowTimer);
    this._frames.forEach(cancelAnimationFrame);
    this._timers.forEach(clearTimeout);
    this._frames.clear();
    this._timers.clear();
    const disposeTimeline = this._timelinePopoverCleanup;
    const roots = [this._scheduleRoot, this._root, this._favRoot];
    this._scheduleRoot = this._root = this._favRoot = null;
    this._timelinePopoverCleanup = null;
    this._currentId = null;
    this._flatIndex = null;
    this._slugIndex = null;
    queueMicrotask(() => {
      disposeTimeline?.();
      roots.forEach((root) => root?.unmount());
    });
  }

  // Called by the React application lifecycle after the directory loads.
  init(staticData: Campus[]) {
    this._generation++;
    this._disposed = false;
    this._events = new AbortController();
    this._staticData = staticData;
    this._overlay = document.getElementById("classroom-detail-overlay");
    this._tabbar = document.querySelector<HTMLElement>(".bn-wrapper");
    this._backBtn = document.getElementById("detail-back-btn");
    this._favBtn = document.getElementById("favourite-btn");

    if (this._overlay) this._root = createRoot(this._overlay);

    if (this._favBtn) this._favRoot = createRoot(this._favBtn);

    this._favBtn?.addEventListener(
      "click",
      () => {
        if (this._currentId === null) return;
        toggleFavourite(this._currentId);
        this._syncFavBtn();
      },
      { signal: this._events.signal },
    );
    window.addEventListener("favourites-changed", () => this._syncFavBtn(), {
      signal: this._events.signal,
    });

    this._backBtn?.addEventListener(
      "click",
      () => {
        if (this._openedViaPushState) {
          goBack();
        } else {
          closePage();
        }
      },
      { signal: this._events.signal },
    );

    window.addEventListener(
      "hidesundayschange",
      (e) => {
        if (!(e instanceof CustomEvent)) return;
        const detail: { hidden: boolean } = e.detail;
        const container = document.getElementById("detail-schedule-container");

        if (container) container.classList.toggle("detail-schedule--hide-sundays", detail.hidden);
      },
      { signal: this._events.signal },
    );

    this._stopLanguage = onLanguageSwitch(() => {
      if (this._currentId === null) return;
      const entry = this._flatIndex?.get(this._currentId);

      if (!entry) return;
      const scrollY = window.scrollY;
      this._renderContent(entry);
      this._loadSchedule(this._currentId);

      if (entry.classroom.idfoto) this._loadPhoto(this._currentId);
      window.scrollTo(0, scrollY);
    });

    window.addEventListener(
      "timeformatchange",
      () => {
        if (this._currentId === null) return;
        const scrollY = window.scrollY;
        this._loadSchedule(this._currentId);
        window.scrollTo(0, scrollY);
      },
      { signal: this._events.signal },
    );

    // Press feedback — the card scales down while the pointer is held (mouse or
    // touch), then springs into the open transition on release. The pressed
    // class is deliberately NOT cleared on pointerup: the click handler below
    // fires synchronously right after, starts the View Transition, and the VT
    // captures the card's "old" snapshot while it's still scaled down, so the
    // zoom animation is a continuous motion out of the pressed state rather than
    // a jump back to full size first. A deferred cleanup (rAF) removes it after
    // the click has had its turn; pointercancel/leave (drag-away, scroll) drop
    // it immediately since no click will follow.
    const clearPressed = () => {
      document
        .querySelectorAll<HTMLElement>(".classroom-card--pressed")
        .forEach((c) => c.classList.remove("classroom-card--pressed"));
    };

    document.addEventListener(
      "pointerdown",
      (e) => {
        const trigger =
          e.target instanceof Element
            ? e.target.closest<HTMLElement>("[data-open-classroom]")
            : null;

        if (!trigger) return;
        const card = trigger.closest<HTMLElement>(".classroom-card") ?? trigger;
        card.classList.add("classroom-card--pressed");
      },
      { signal: this._events.signal },
    );
    document.addEventListener("pointerup", () => this._frame(clearPressed), {
      signal: this._events.signal,
    });
    document.addEventListener("pointercancel", clearPressed, { signal: this._events.signal });

    // Click delegation — handles classroom cards on both the available and campus tabs
    document.addEventListener(
      "click",
      (e) => {
        const trigger =
          e.target instanceof Element
            ? e.target.closest<HTMLElement>("[data-open-classroom]")
            : null;

        if (!trigger) return;
        e.stopPropagation();

        const id = parseInt(trigger.dataset.openClassroom!);

        // The whole card morphs into the whole page (VT shared element).
        const card = trigger.closest<HTMLElement>(".classroom-card") ?? trigger;

        const queryDate = card.dataset.queryDate ?? null;
        const queryFrom = card.dataset.queryFrom ?? null;
        const queryTo = card.dataset.queryTo ?? null;

        const queryContext =
          queryDate && queryFrom && queryTo
            ? { date: queryDate, from: queryFrom, to: queryTo }
            : null;

        const highlightDate = card.dataset.highlightDate ?? null;
        const highlightFrom = card.dataset.highlightFrom ?? null;
        const highlightTo = card.dataset.highlightTo ?? null;
        const highlightProfessors = card.dataset.highlightProfessors ?? null;

        const highlight =
          highlightDate && highlightFrom && highlightTo
            ? {
                date: highlightDate,
                from: highlightFrom,
                to: highlightTo,
                professors: highlightProfessors ? highlightProfessors.split("|") : [],
              }
            : null;

        this._pendingTrigger = { queryContext, highlight, cardEl: card };
        this._openedViaPushState = true;
        this._buildFlatIndex();
        const _entry = this._flatIndex?.get(id);
        openPage(
          _entry
            ? "/classroom/" + _entry.campus.slug + "/" + encodeURIComponent(_entry.classroom.name)
            : "/classroom/" + id,
        );
      },
      { signal: this._events.signal },
    );
  }

  // Reflects the current classroom's favourite state on the header star button.
  _syncFavBtn() {
    if (!this._favBtn || this._currentId === null) return;
    const fav = isFavourite(this._currentId);
    // .favourite-btn--active tints the star yellow (see style.css); the outline
    // hgi-star is swapped for a filled star SVG.
    this._favBtn.classList.toggle("favourite-btn--active", fav);
    this._favBtn.setAttribute("aria-label", t(fav ? "favourite.remove" : "favourite.add"));
    this._favBtn.setAttribute("aria-pressed", fav ? "true" : "false");
    flushSync(() =>
      this._favRoot?.render(
        fav ? <FilledStar /> : <i className="hgi-stroke hgi-star" aria-hidden="true" />,
      ),
    );
  }

  // Called by script.js once occupancy data has finished loading in the
  // background, so a detail page opened before that (e.g. via a direct link)
  // fills in its status badge and timeline instead of staying stuck on
  // "no data".
  refreshOccupancy() {
    if (this._currentId === null) return;
    const entry = this._flatIndex?.get(this._currentId);

    if (!entry) return;
    const scrollY = window.scrollY;
    this._renderContent(entry);
    this._loadSchedule(this._currentId);

    if (entry.classroom.idfoto) this._loadPhoto(this._currentId);
    window.scrollTo(0, scrollY);
  }

  // Route matching and decoding are owned by TanStack Router.
  openRoute(
    id: string | undefined,
    campus: string | undefined,
    name: string | undefined,
    initial: boolean,
  ) {
    this._buildFlatIndex();

    const entry =
      id !== undefined
        ? /^\d+$/.test(id)
          ? this._flatIndex?.get(Number(id))
          : undefined
        : this._slugIndex?.get((campus ?? "").toLowerCase() + "\x00" + (name ?? "").toLowerCase());

    if (!entry) {
      this._pendingTrigger = null;

      // Directly loaded missing classrooms leave their bookmark untouched.
      if (!initial) closePage();

      return;
    }

    const pending = this._pendingTrigger;
    this._pendingTrigger = null;
    this._doOpen(entry.classroom.id, pending);
  }

  leaveRoute(nextPage: string) {
    if (this._currentId === null) return;

    if (nextPage === "info") {
      this._silentClose();
    } else {
      this._doClose();
    }
  }

  _silentClose() {
    if (!this._overlay || this._overlay!.hidden) return;
    this._currentId = null;
    clearInterval(this._nowTimer);
    document.body.classList.remove("detail-open");
    // Leave tabbar.detail-open and backBtn visibility intact — info page takes over both
    this._overlay!.setAttribute("hidden", "");
    this._overlay!.classList.remove("visible");
    this._clearContent();
    this._openTrigger = null;
    this._queryContext = null;
    this._highlight = null;
  }

  // ---------- OPEN ----------

  async _doOpen(id: number, pending: OpenTrigger | null) {
    const generation = this._generation;

    if (!this._overlay) return;
    this._buildFlatIndex();

    const entry = this._flatIndex?.get(id);

    if (!entry) return;

    this._currentId = id;
    this._openTrigger = pending ?? null;
    this._queryContext = pending?.queryContext ?? null;
    this._highlight = pending?.highlight ?? null;
    this._highlightConsumed = false;

    // Save scroll position for when we return
    this._savedScrollPos = window.scrollY;

    // When returning from info page, the back button is already visible and info's own
    // hero elements should morph into the header instead of touching the tabbar.
    const fromInfo = !!(this._backBtn && !this._backBtn.hidden);

    // Photo VT: if the URL is already cached, pre-decode it so the detail photo
    // is bitmap-ready when the VT snapshots the new state.
    const hasPhoto = !!entry.classroom.idfoto;
    let validPhotoUrl = hasPhoto ? (photoUrlCache.get(id) ?? null) : null;

    if (validPhotoUrl) {
      const tmp = new Image();
      tmp.src = validPhotoUrl;

      const decoded = await tmp
        .decode()
        .then(() => true)
        .catch(() => false);

      if (this._currentId !== id || generation !== this._generation) return; // navigated away during decode

      // Decode failed (e.g. a 404 from a stale idfoto) — don't stamp a broken image as
      // "loaded" below. Leaving validPhotoUrl unset lets _loadPhoto()'s own error path
      // (which removes the photo container entirely) run normally instead of being
      // skipped via its "already loaded" short-circuit.
      if (!decoded) validPhotoUrl = null;
    }

    if (document.startViewTransition) {
      // -- Whole-card zoom: one shared element, the card's own bounding box
      // morphs straight into the full page (SwiftUI .zoom-style), rather than
      // morphing name/photo/icons independently. --
      const cardEl = pending?.cardEl ?? null;
      const cardInDom = !!(cardEl && document.body.contains(cardEl));
      // The header is a constant translucent/blurred overlay, not content that
      // changes — it doesn't need to cross-fade with the rest of "root". But
      // a VT freezes everything (including backdrop-filter's live sampling)
      // into snapshots, so lumped into root it would show the frozen *old*
      // blur (behind the small card) for the whole animation. Naming it
      // separately, pinned with no animation, freezes its own snapshot at the
      // already-correct *new* blur (behind the full-size photo) from frame one.
      const headerEl = document.querySelector<HTMLElement>(".header");

      if (headerEl) headerEl.style.viewTransitionName = "app-header";

      if (fromInfo) infoPage._prepareReturnVT();

      if (cardInDom) cardEl.style.viewTransitionName = "classroom-detail-zoom";

      // Strip the glass blur off the scaling header controls for the transition
      // (see .header-ctl-vt in classroom-detail.css).
      document.documentElement.classList.add("header-ctl-vt");

      const vt = document.startViewTransition(() => {
        if (this._disposed || generation !== this._generation) return;

        if (fromInfo) {
          infoPage._applyReturnVT();
        } else if (this._tabbar) {
          this._tabbar.classList.add("detail-open");
        }

        if (cardInDom) cardEl.style.viewTransitionName = "";

        document.body.classList.add("detail-open");

        // --header-height is normally kept live by a ResizeObserver (script.js),
        // but that callback fires asynchronously — too late for the VT, which
        // snapshots the "new" state synchronously right after this callback
        // returns. Without this, the photo's margin-top (which reads that var)
        // uses the stale, pre-detail-open header height for the whole
        // animation, so the "tucked behind the header" look only snaps in
        // once the transition ends and the real DOM/ResizeObserver catch up.
        if (headerEl) {
          document.documentElement.style.setProperty(
            "--header-height",
            `${headerEl.offsetHeight}px`,
          );
        }

        this._overlay!.removeAttribute("hidden");
        this._renderContent(entry);
        this._overlay!.classList.add("visible");

        if (this._backBtn) this._backBtn.removeAttribute("hidden");

        if (this._favBtn) {
          this._favBtn.removeAttribute("hidden");
          this._syncFavBtn();
        }

        window.scrollTo(0, 0);

        // Force a synchronous layout flush before naming the overlay, so its
        // flex-resolved size (siblings hidden via .detail-open above) is fully
        // settled at the exact moment the VT captures the "new" state geometry.
        void this._overlay!.offsetHeight;
        this._overlay!.style.viewTransitionName = "classroom-detail-zoom";

        if (validPhotoUrl) this._photo.current?.reveal(validPhotoUrl);

        this._loadSchedule(id);

        if (hasPhoto) this._loadPhoto(id);
      });

      const cleanup = () => {
        if (generation !== this._generation) return;
        this._overlay!.style.viewTransitionName = "";

        if (cardEl) cardEl.style.viewTransitionName = "";

        if (headerEl) headerEl.style.viewTransitionName = "";
        document.documentElement.classList.remove("header-ctl-vt");

        if (fromInfo) infoPage._cleanupReturnVT();
      };

      // A second VT firing before this one settles rejects .ready/.finished with
      // InvalidStateError; .finished is handled above, but .ready isn't awaited
      // anywhere, so it was surfacing as an unhandled rejection on every abort.
      vt.ready.catch(() => {});
      vt.finished.then(cleanup).catch(cleanup);
    } else {
      // Fallback: show overlay, swap tabbar for back button without animation
      if (fromInfo) {
        infoPage._applyReturnVT();
      } else {
        if (this._tabbar) this._tabbar.classList.add("detail-open");
      }

      document.body.classList.add("detail-open");
      this._overlay!.removeAttribute("hidden");
      this._renderContent(entry);

      // Stamp cached photo immediately in the fallback path too
      if (validPhotoUrl) this._photo.current?.reveal(validPhotoUrl);

      if (this._backBtn) this._backBtn.removeAttribute("hidden");

      if (this._favBtn) {
        this._favBtn.removeAttribute("hidden");
        this._syncFavBtn();
      }

      this._frame(() => {
        this._overlay!.classList.add("visible");
        window.scrollTo(0, 0);
      });

      // Load data immediately after rendering in the fallback branch
      this._loadSchedule(id);

      if (hasPhoto) this._loadPhoto(id);
    }
  }

  // ---------- CLOSE ----------

  _doClose() {
    const generation = this._generation;

    if (!this._overlay || this._overlay!.hidden) return;

    this._currentId = null;

    const cardEl = this._openTrigger?.cardEl ?? null;
    const cardInDom = !!(cardEl && document.body.contains(cardEl));
    const headerEl = document.querySelector<HTMLElement>(".header");

    const cleanup = () => {
      if (generation !== this._generation) return;
      this._clearContent();
      this._openTrigger = null;
      this._queryContext = null;
      this._highlight = null;
      this._overlay!.style.viewTransitionName = "";

      if (headerEl) headerEl.style.viewTransitionName = "";
      document.documentElement.classList.remove("header-vt-fixed");
      document.documentElement.classList.remove("header-ctl-vt");

      if (cardEl) {
        cardEl.style.viewTransitionName = "";
        cardEl.style.removeProperty("content-visibility");
      }
    };

    if (document.startViewTransition) {
      // content-visibility: auto skips rendering off-screen cards, which would make
      // the VT new-state snapshot blank. Force it visible here so the card's
      // subtree is rendered when the VT captures it after scrollTo().
      if (cardInDom) cardEl.style.contentVisibility = "visible";

      // See _doOpen: the header is pinned as its own group so its frozen
      // snapshot always shows the already-correct blur, instead of being
      // lumped into root and frozen mid-way through the wrong state.
      if (headerEl) headerEl.style.viewTransitionName = "app-header";

      this._overlay!.style.viewTransitionName = "classroom-detail-zoom";

      // Strip the glass blur off the scaling header controls for the transition
      // (see .header-ctl-vt in classroom-detail.css).
      document.documentElement.classList.add("header-ctl-vt");

      const vt = document.startViewTransition(() => {
        if (this._disposed || generation !== this._generation) return;
        // -- DOM changes (defines NEW state) --

        // Fully hide the overlay and back button
        document.body.classList.remove("detail-open");
        this._overlay!.setAttribute("hidden", "");
        this._overlay!.classList.remove("visible");

        if (this._backBtn) this._backBtn.setAttribute("hidden", "");

        if (this._favBtn) this._favBtn.setAttribute("hidden", "");
        this._overlay!.style.viewTransitionName = "";

        if (headerEl) {
          document.documentElement.style.setProperty(
            "--header-height",
            `${headerEl.offsetHeight}px`,
          );
          // Safari captures a position:sticky element's ::view-transition-group at
          // its unstuck flow position, so this new-state snapshot of the header
          // would land off-screen whenever the list was scrolled. Pin it with
          // position:fixed (viewport-relative, captured correctly) for the
          // duration of this transition; the matching CSS gives .body-container a
          // compensating padding-top so nothing shifts. Cleared in cleanup().
          document.documentElement.classList.add("header-vt-fixed");
        }

        // Restore the tabbar (plain fade, no shared element — it no longer sits in the header)
        if (this._tabbar) this._tabbar.classList.remove("detail-open");

        // Restore scroll position so VT can morph back to the correct spot
        window.scrollTo(0, this._savedScrollPos);

        // Force a synchronous layout flush before naming the card, so its
        // resolved position/size (list re-scrolled above) is fully settled at
        // the exact moment the VT captures the "new" state geometry.
        if (cardInDom) {
          void cardEl.offsetHeight;
          cardEl.style.viewTransitionName = "classroom-detail-zoom";
        }
      });

      vt.ready.catch(() => {});
      vt.finished.then(cleanup).catch(cleanup);
    } else {
      // Fallback: fade out overlay, swap back button for tabbar without animation
      this._overlay!.classList.remove("visible");

      if (this._tabbar) this._tabbar.classList.remove("detail-open");

      if (this._backBtn) this._backBtn.setAttribute("hidden", "");

      if (this._favBtn) this._favBtn.setAttribute("hidden", "");

      const hide = () => {
        document.body.classList.remove("detail-open");
        this._overlay!.setAttribute("hidden", "");
        window.scrollTo(0, this._savedScrollPos);
        cleanup();
      };

      this._overlay!.addEventListener("transitionend", hide, {
        once: true,
        signal: this._events.signal,
      });
      this._later(hide, 400);
    }
  }

  // ---------- FLAT INDEX ----------

  _buildFlatIndex() {
    if (this._flatIndex) return;
    this._flatIndex = new Map();
    this._slugIndex = new Map();

    for (const campus of this._staticData ?? []) {
      for (const building of campus.buildings) {
        for (const classroom of building.classrooms) {
          const entry = { classroom, building, campus };
          this._flatIndex.set(classroom.id, entry);
          this._slugIndex.set(campus.slug + "\x00" + classroom.name.toLowerCase(), entry);
        }
      }
    }
  }

  // ---------- RENDER: STATIC CONTENT ----------

  _renderContent({ classroom, building, campus }: ClassroomEntry) {
    this._clearSchedule();
    this._contentEvents.abort();
    this._contentEvents = new AbortController();
    this._revision++;

    const featuresHtml = (classroom.features ?? [])
      .filter((f) => FEATURE_ICONS.has(String(f.id)))
      .map(({ id }) => {
        const { icon, key } = FEATURE_ICONS.get(String(id))!;

        return (
          <>
            <div className={"detail-feature-chip liquid-glass"} data-feature-id={id}>
              <i className={"hgi-stroke " + icon} aria-hidden={"true"}></i>
              <span>{t(key)}</span>
            </div>
          </>
        );
      });

    const status = getClassroomStatusNow(classroom.id);
    let statusHtml: ReactNode = null;

    if (status) {
      const statusKeys = {
        free: "status.free",
        occupied: "status.occupied",
        "free-soon": "status.freeSoon",
        "occupied-soon": "status.occupiedSoon",
      };

      statusHtml = (
        <>
          <div className={"detail-status-wrapper"}>
            <span className={"detail-status-label"}>{t("detail.currentStatus")}</span>
            <h4 className={"classroom-status-txt " + status}>{t(statusKeys[status])}</h4>
          </div>
        </>
      );
    }

    flushSync(() =>
      this._root?.render(
        <Fragment key={this._revision}>
          {classroom.idfoto ? <DetailPhoto ref={this._photo} /> : ""}
          <div className={"detail-header"}>
            <div className={"detail-title-row"}>
              <h1 className={"detail-title"} role={"button"} tabIndex={0}>
                {classroom.name}
              </h1>
              {statusHtml}
            </div>
            <p className={"detail-subtitle secondary"}>
              {t("building.prefix")}{" "}
              {building.altName ? `${building.altName} (${building.name})` : building.name}
              {" · "}
              {campus.name}
            </p>
            <div className={"detail-stats"}>
              <div className={"detail-stat"}>
                <i className={"hgi-stroke hgi-user-multiple"} aria-hidden={"true"}></i>
                <span>
                  {classroom.seats} {t("detail.seats")}
                </span>
              </div>
              {classroom.accessible_seats ? (
                <>
                  <div className={"detail-stat"}>
                    <i className={"hgi-stroke hgi-wheelchair"} aria-hidden={"true"}></i>
                    <span>
                      {classroom.accessible_seats} {t("detail.disabledSeats")}
                    </span>
                  </div>
                </>
              ) : (
                ""
              )}
            </div>
          </div>
          <div className={"detail-content"}>
            <section className={"detail-section"}>
              <h2 className={"detail-section-title"}>{t("detail.features")}</h2>
              {featuresHtml.length ? (
                <>
                  <div className={"detail-features"}>{Children.toArray(featuresHtml)}</div>
                </>
              ) : (
                <>
                  <p className={"secondary detail-no-features"}>{t("detail.noFeatures")}</p>
                </>
              )}
            </section>
            <section className={"detail-section"}>
              <div className={"detail-section-header"}>
                <h2 className={"detail-section-title"}>{t("detail.weeklySchedule")}</h2>
                <div className={"detail-schedule-legend"}>
                  <div className={"detail-schedule-legend-item"}>
                    <span className={"detail-schedule-legend-box"}></span>
                    <span className={"detail-schedule-legend-label"}>{t("detail.occupied")}</span>
                  </div>
                </div>
              </div>
              <div id="detail-schedule-container" />
            </section>
          </div>
        </Fragment>,
      ),
    );

    const schedule = document.getElementById("detail-schedule-container");

    if (schedule) {
      this._scheduleRoot = createRoot(schedule);
      flushSync(() =>
        this._scheduleRoot?.render(
          <div className="detail-schedule-loading">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="detail-schedule-skeleton" />
            ))}
          </div>,
        ),
      );
    }

    // Title click -> manual refresh of photo and schedule
    this._overlay!.querySelector<HTMLElement>(".detail-title")?.addEventListener(
      "click",
      () => {
        this._loadSchedule(classroom.id);

        if (classroom.idfoto) this._loadPhoto(classroom.id);
      },
      { signal: this._contentEvents.signal },
    );
  }

  // ---------- RENDER: HERO PHOTO ----------

  async _loadPhoto(classroomId: number) {
    if (this._currentId !== classroomId) return;
    const photo = this._photo.current;

    if (!photo) return;

    try {
      const cachedUrl = photoUrlCache.get(classroomId);
      photo.show();

      if (this._overlay?.querySelector<HTMLElement>(".detail-photo.loaded")) return;

      if (cachedUrl) {
        photo.reveal(cachedUrl);

        return;
      }

      const url = await fetchPhotoUrl(classroomId);

      if (this._currentId !== classroomId || this._photo.current !== photo) return;
      const img = photo.load(url);

      if (!img) return;
      await img.decode();

      if (this._currentId === classroomId && this._photo.current === photo) photo.reveal(url);
    } catch (err) {
      console.error("Classroom photo load error:", err);

      if (this._currentId === classroomId && this._photo.current === photo) photo.hide();
    }
  }

  // ---------- RENDER: WEEKLY SCHEDULE ----------

  _loadSchedule(classroomId: number) {
    this._scheduleRevision++;
    clearInterval(this._nowTimer);
    this._timelinePopoverCleanup?.();
    this._timelinePopoverCleanup = null;
    this._scheduleEvents.abort();
    this._scheduleEvents = new AbortController();
    const data = occupancyData;
    const container = document.getElementById("detail-schedule-container");

    if (!container) {
      console.warn("ClassroomDetail: Schedule container not found in DOM");

      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      console.warn("ClassroomDetail: No occupancy data found or empty");
      flushSync(() =>
        this._scheduleRoot?.render(
          <Fragment key={this._scheduleRevision}>
            <p className={"secondary"}>{t("detail.noData")}</p>
          </Fragment>,
        ),
      );

      return;
    }

    try {
      const today = new Date();

      const todayKey = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0"),
      ].join("");

      const DAY_START = 7 * 60 + 15;
      const DAY_END = 20 * 60 + 15;
      const total = DAY_END - DAY_START;

      // Build chronological day list, inserting Sunday placeholders between data days
      const parseKey = (key: string) =>
        new Date(
          parseInt(key.slice(0, 4), 10),
          parseInt(key.slice(4, 6), 10) - 1,
          parseInt(key.slice(6, 8), 10),
        );

      const sortedData = data
        .filter((d) => d?.date)
        .sort((a, b) => parseKey(a.date).getTime() - parseKey(b.date).getTime());

      const days: { dayData: OccupancyDay | null; date: Date }[] = [];
      let prevDate: Date | null = null;

      for (const dayData of sortedData) {
        const curr = parseKey(dayData.date);

        if (prevDate) {
          const check = new Date(prevDate);
          check.setDate(check.getDate() + 1);

          while (check < curr) {
            if (SKIP_DAYS.includes(check.getDay()))
              days.push({ dayData: null, date: new Date(check) });
            check.setDate(check.getDate() + 1);
          }
        }

        days.push({ dayData, date: curr });
        prevDate = curr;
      }

      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

      const nowPct =
        nowMin >= DAY_START && nowMin <= DAY_END
          ? (((nowMin - DAY_START) / total) * 100).toFixed(2)
          : null;

      // Query context: from/to range carried over from the Available Tab
      const queryDateKey = this._queryContext?.date?.replace(/-/g, "") ?? null;
      const highlightDateKey = this._highlight?.date?.replace(/-/g, "") ?? null;

      const highlightProfessors = new Set(
        (this._highlight?.professors ?? []).map((p) => p.trim().toLowerCase()),
      );

      let queryFromPct = null,
        queryToPct = null,
        queryFromDisplay = "",
        queryToDisplay = "";

      if (this._queryContext) {
        const qFrom = Math.max(timeToMinutes(this._queryContext.from), DAY_START);
        const qTo = Math.min(timeToMinutes(this._queryContext.to), DAY_END);
        queryFromPct = (((qFrom - DAY_START) / total) * 100).toFixed(2);
        queryToPct = (((qTo - DAY_START) / total) * 100).toFixed(2);
        queryFromDisplay = minutesToTimeDisplay(qFrom);
        queryToDisplay = minutesToTimeDisplay(qTo);
      }

      // Populated as blocks are built; a block's data-slot-idx indexes into this
      // so the popover can look up its full metadata without re-parsing the DOM.
      const scheduleSlots: Occupation[] = [];

      // Which days have a secondary-highlighted block — drives the mobile day
      // chip dot marker, since only the active day's row is visible there.
      const dayHighlightFlags: boolean[] = [];

      const _dayParts = days.map(({ dayData, date }, dayIndex) => {
        const isSunday = !dayData;

        const dayNum = date.getDate();
        const narrowDay = date.toLocaleDateString(getLocale(), { weekday: "narrow" });
        const narrowDayName = narrowDay.charAt(0).toUpperCase() + narrowDay.slice(1);
        const isToday = !isSunday && dayData.date === todayKey;
        const isQueryDay = !isSunday && queryDateKey !== null && dayData.date === queryDateKey;

        const labelHtml = (
          <>
            <div
              className={
                "detail-schedule-label-cell" +
                (isToday ? " detail-schedule-label-cell--today" : "") +
                " date-element-container"
              }
            >
              <span className={"date-day-of-week" + (isSunday ? " date-sunday" : "")}>
                {narrowDayName}
              </span>
              <span className={"date-number"}>{dayNum}</span>
            </div>
          </>
        );

        if (isSunday) {
          dayHighlightFlags[dayIndex] = false;

          return {
            labelHtml,
            rowHtml: (
              <>
                <div className={"detail-schedule-row detail-schedule-row--sunday"}>
                  <div className={"detail-schedule-bar-wrapper"}>
                    <div className={"detail-schedule-bar"}></div>
                  </div>
                </div>
              </>
            ),
          };
        }

        let occupancy: Occupation[] = [];

        outer: for (const c of dayData.campuses ?? []) {
          for (const b of c.buildings ?? []) {
            const room = b.classrooms?.find((r) => String(r.id) === String(classroomId));

            if (room) {
              occupancy = room.occupancy ?? [];
              break outer;
            }
          }
        }

        let daySecondaryHighlight = false;

        const blocksHtml = (occupancy || []).map((slot, idx) => {
          if (!slot.inizio || !slot.fine) return "";
          const s = Math.max(timeToMinutes(slot.inizio), DAY_START);
          const e = Math.min(timeToMinutes(slot.fine), DAY_END);

          if (e <= s) return "";
          const left = (((s - DAY_START) / total) * 100).toFixed(2);
          const width = (((e - s) / total) * 100).toFixed(2);
          const slotIdx = scheduleSlots.push(slot) - 1;

          const isPrimaryHighlight =
            highlightDateKey !== null &&
            dayData.date === highlightDateKey &&
            slot.inizio === this._highlight?.from &&
            slot.fine === this._highlight?.to;

          const isSecondaryHighlight =
            !isPrimaryHighlight &&
            highlightProfessors.size > 0 &&
            (slot.professors ?? []).some((p) => highlightProfessors.has(p.trim().toLowerCase()));

          if (isSecondaryHighlight) daySecondaryHighlight = true;

          return (
            <>
              <div
                className={
                  "detail-schedule-block" +
                  (isPrimaryHighlight ? " detail-schedule-block--highlight" : "") +
                  (isSecondaryHighlight ? " detail-schedule-block--highlight-secondary" : "")
                }
                data-slot-idx={slotIdx}
                tabIndex={0}
                role={"button"}
                style={cssVars({
                  "--block-start": left + "%",
                  "--block-size": width + "%",
                  "--idx": idx,
                })}
              ></div>
            </>
          );
        });

        dayHighlightFlags[dayIndex] = daySecondaryHighlight;

        const queryOverlayHtml =
          isQueryDay && queryFromPct !== null ? (
            <>
              <div
                className={"detail-schedule-query-region"}
                style={cssVars({ "--qfrom": queryFromPct + "%", "--qto": queryToPct + "%" })}
              ></div>
            </>
          ) : (
            ""
          );

        const querySideIndicatorsHtml =
          isQueryDay && queryFromPct !== null ? (
            <>
              <div
                className={"detail-schedule-query-indicator"}
                style={cssVars({ "--qpos": queryFromPct + "%" })}
              >
                {queryFromDisplay}
              </div>
              <div
                className={"detail-schedule-query-indicator"}
                style={cssVars({ "--qpos": queryToPct + "%" })}
              >
                {queryToDisplay}
              </div>
            </>
          ) : (
            ""
          );

        return {
          labelHtml,
          rowHtml: (
            <>
              <div
                className={
                  "detail-schedule-row" +
                  (isToday ? " detail-schedule-row--today" : "") +
                  (isQueryDay ? " detail-schedule-row--query" : "")
                }
              >
                <div className={"detail-schedule-bar-wrapper"}>
                  <div className={"timeline-hover-cursor"} hidden></div>
                  {isToday && nowPct !== null ? (
                    <>
                      <div
                        className={"timeline-time-indicator timeline-time-indicator--now"}
                        style={cssVars({ "--pos": nowPct + "%" })}
                      >
                        {t("timepicker.now")}
                      </div>
                    </>
                  ) : (
                    ""
                  )}
                  {querySideIndicatorsHtml}
                  <div className={"detail-schedule-bar"}>
                    {queryOverlayHtml}
                    {Children.toArray(blocksHtml)}
                    {isToday && nowPct !== null ? (
                      <>
                        <div
                          className={"timeline-now-bar-line"}
                          style={cssVars({ "--pos": nowPct + "%" })}
                        ></div>
                      </>
                    ) : (
                      ""
                    )}
                    <div className={"timeline-hover-line"} hidden></div>
                  </div>
                </div>
              </div>
            </>
          ),
        };
      });

      const labelsHtml = _dayParts.map((p) => p.labelHtml);
      const rowsHtml = _dayParts.map((p) => p.rowHtml);

      if (!rowsHtml.length) {
        console.warn("ClassroomDetail: No room matches found in any day of occupancy data");
        flushSync(() =>
          this._scheduleRoot?.render(
            <Fragment key={this._scheduleRevision}>
              <p className={"secondary"}>{t("detail.noData")}</p>
            </Fragment>,
          ),
        );

        return;
      }

      const nowTickHtml =
        nowPct !== null ? (
          <>
            <div
              className={"timeline-time-indicator timeline-time-indicator--now"}
              style={cssVars({ "--pos": nowPct + "%" })}
            >
              {t("timepicker.now")}
            </div>
          </>
        ) : (
          ""
        );

      const queryTicksHtml =
        queryFromPct !== null ? (
          <>
            <div
              className={"detail-schedule-query-indicator"}
              style={cssVars({ "--qpos": queryFromPct + "%" })}
            >
              {queryFromDisplay}
            </div>
            <div
              className={"detail-schedule-query-indicator"}
              style={cssVars({ "--qpos": queryToPct + "%" })}
            >
              {queryToDisplay}
            </div>
          </>
        ) : (
          ""
        );

      const ticksHtml = (() => {
        const ticks: ReactNode[] = [];

        for (let m = DAY_START + 60; m < DAY_END; m += 60) {
          const left = (((m - DAY_START) / total) * 100).toFixed(2);
          ticks.push(
            <>
              <div className={"detail-schedule-tick"} style={cssVars({ "--pos": left + "%" })}>
                <span>{minutesToTimeDisplay(m)}</span>
              </div>
            </>,
          );
        }

        return Children.toArray(ticks);
      })();

      const gridLinesHtml = (() => {
        const lines: ReactNode[] = [];

        for (let m = DAY_START + 60; m < DAY_END; m += 60) {
          const left = (((m - DAY_START) / total) * 100).toFixed(2);
          lines.push(
            <>
              <div
                className={"detail-schedule-grid-line"}
                style={cssVars({ "--pos": left + "%" })}
              ></div>
            </>,
          );
        }

        if (nowPct !== null) {
          lines.push(
            <>
              <div
                className={"detail-schedule-now-line"}
                style={cssVars({ "--pos": nowPct + "%" })}
              ></div>
            </>,
          );
        }

        return Children.toArray(lines);
      })();

      // --- Mobile day selector chips ---
      const selectorItemsHtml = () =>
        days.map(({ dayData, date }, i) => {
          const isSunday = !dayData;

          const raw = date.toLocaleDateString(getLocale(), { weekday: "narrow" });
          const dayName = raw.charAt(0).toUpperCase() + raw.slice(1);
          const dayNum = date.getDate();

          return (
            <>
              <div
                className={
                  "date-element-container" +
                  (isSunday ? " detail-schedule-day--sunday date-skipped" : "")
                }
                data-day-index={i}
              >
                <span className={"date-day-of-week" + (isSunday ? " date-sunday" : "")}>
                  {dayName}
                </span>
                <span className={"date-number"}>{dayNum}</span>
                {dayHighlightFlags[i] && (
                  <span className="detail-schedule-day-highlight-dot" aria-hidden="true" />
                )}
              </div>
            </>
          );
        });

      flushSync(() =>
        this._scheduleRoot?.render(
          <Fragment key={this._scheduleRevision}>
            <div className={"detail-schedule-day-selector"}>
              <div className={"detail-today-indicator hidden"} aria-hidden={"true"}>
                {t("datepicker.today")}
              </div>
              <div className={"date-picker-container detail-schedule-picker"}>
                <div className="date-picker-items">{Children.toArray(selectorItemsHtml())}</div>
              </div>
              <div className="date-indicator">
                <div className="date-indicator-inner">
                  <div className="date-indicator-active-row" />
                </div>
              </div>
              <div className="date-indicator-hit" />
            </div>
            <div className={"detail-schedule-inner"}>
              <div className={"detail-schedule-ticks"}>
                {ticksHtml}
                {nowTickHtml}
                {queryTicksHtml}
              </div>
              <div className={"detail-schedule-grid"}>
                <div className={"detail-desktop-today-indicator hidden"} aria-hidden={"true"}>
                  {t("datepicker.today")}
                </div>
                <div className={"detail-schedule-labels-pill liquid-glass"}>
                  {Children.toArray(labelsHtml)}
                </div>
                <div className={"detail-schedule-bars"}>
                  <div className={"detail-schedule-grid-lines"}>{gridLinesHtml}</div>
                  {Children.toArray(rowsHtml)}
                </div>
              </div>
            </div>
          </Fragment>,
        ),
      );

      if (localStorage.getItem("poliAule_hideSundays") === "true") {
        container.classList.add("detail-schedule--hide-sundays");
      }

      this._nowTimer = window.setInterval(() => {
        const n = new Date().getHours() * 60 + new Date().getMinutes();

        const pctVal =
          n >= DAY_START && n <= DAY_END
            ? `${(((n - DAY_START) / total) * 100).toFixed(2)}%`
            : null;

        container
          .querySelectorAll<HTMLElement>(
            ".timeline-time-indicator--now, .timeline-now-bar-line, .detail-schedule-now-line",
          )
          .forEach((el) => {
            if (pctVal) {
              el.style.setProperty("--pos", pctVal);
              el.hidden = false;
            } else {
              el.hidden = true;
            }
          });
      }, 60_000);

      // --- Mobile day selector interaction (drag/spring physics ported
      // from bottom-nav.js's tab pill — see pill-selector.js) ---
      const pickerContainer = container.querySelector<HTMLElement>(".detail-schedule-picker");
      const todayIndicatorEl = container.querySelector<HTMLElement>(".detail-today-indicator");
      const gridEl = container.querySelector<HTMLElement>(".detail-schedule-bars");
      const rowEls = gridEl!.querySelectorAll<HTMLElement>(".detail-schedule-row");

      // The highlight is a one-shot cue for the lesson the user just searched
      // for — the first tap, keypress or day change inside the schedule drops it.
      const clearHighlight = () => {
        if (!this._highlight) return;
        this._highlight = null;
        container
          .querySelectorAll(
            ".detail-schedule-block--highlight, .detail-schedule-block--highlight-secondary",
          )
          .forEach((el) =>
            el.classList.remove(
              "detail-schedule-block--highlight",
              "detail-schedule-block--highlight-secondary",
            ),
          );
      };

      container.addEventListener("pointerdown", clearHighlight, {
        signal: this._scheduleEvents.signal,
      });
      container.addEventListener("keydown", clearHighlight, {
        signal: this._scheduleEvents.signal,
      });

      let selectedDayIndex = 0;

      const daySelector = createPillSelector(pickerContainer!, {
        rendered: {
          items: pickerContainer!.querySelector<HTMLElement>(".date-picker-items")!,
          indicator: container.querySelector<HTMLElement>(".date-indicator")!,
          activeRow: container.querySelector<HTMLElement>(".date-indicator-active-row")!,
          hit: container.querySelector<HTMLElement>(".date-indicator-hit")!,
        },
        onSelect(chip, { silent }) {
          const index = parseInt(chip.dataset.dayIndex!);
          selectedDayIndex = index;
          rowEls.forEach((row, i) => row.classList.toggle("selected", i === index));

          if (!silent) {
            hideOccupationPopover();
          }
        },
      });

      daySelector.refresh();

      function selectScheduleDay(index: number, opts?: PillSelection) {
        const chip = pickerContainer!.querySelector<HTMLElement>(`[data-day-index="${index}"]`);

        if (chip) daySelector.selectElement(chip, opts);
      }

      // Auto-select: prefer the queried or highlighted day when coming from the
      // Available Tab or search overlay, otherwise today, or next available day
      // if after 20:15, or first available
      const todayDayIndex = days.findIndex((d) => d.dayData?.date === todayKey);
      const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
      const preferredDateKey = queryDateKey ?? highlightDateKey;
      let initialDayIndex;

      if (preferredDateKey) {
        const preferredDayIndex = days.findIndex((d) => d.dayData?.date === preferredDateKey);
        initialDayIndex =
          preferredDayIndex >= 0
            ? preferredDayIndex
            : todayDayIndex >= 0
              ? todayDayIndex
              : days.findIndex((d) => d.dayData !== null);
      } else if (nowMins > DAY_END && todayDayIndex >= 0) {
        const nextIndex = days.findIndex((d, i) => i > todayDayIndex && d.dayData !== null);
        initialDayIndex = nextIndex >= 0 ? nextIndex : todayDayIndex;
      } else if (todayDayIndex >= 0) {
        initialDayIndex = todayDayIndex;
      } else {
        initialDayIndex = days.findIndex((d) => d.dayData !== null);
      }

      selectScheduleDay(Math.max(0, initialDayIndex), { silent: true, animate: false });

      // Today indicator: position the pill above the today chip (mobile only)
      function positionDetailTodayIndicator() {
        if (!todayIndicatorEl || !window.matchMedia("(max-width: 599px)").matches) return;

        const todayChip = pickerContainer!.querySelector<HTMLElement>(
          `[data-day-index="${todayDayIndex}"]`,
        );

        if (!todayChip || todayDayIndex < 0) {
          todayIndicatorEl.classList.add("hidden");

          return;
        }

        todayIndicatorEl.classList.remove("hidden");
        const left = pickerContainer!.offsetLeft + todayChip.offsetLeft + todayChip.offsetWidth / 2;
        const top = pickerContainer!.offsetTop - todayIndicatorEl.offsetHeight - 8;
        todayIndicatorEl.style.left = `${left}px`;
        todayIndicatorEl.style.top = `${top}px`;
      }

      todayIndicatorEl?.addEventListener(
        "click",
        () => {
          if (todayDayIndex >= 0) selectScheduleDay(todayDayIndex);
        },
        { signal: this._scheduleEvents.signal },
      );
      positionDetailTodayIndicator();

      // Desktop Today indicator — position it vertically aligned with the today cell
      const desktopTodayIndicatorEl = container.querySelector<HTMLElement>(
        ".detail-desktop-today-indicator",
      );

      const pillEl = container.querySelector<HTMLElement>(".detail-schedule-labels-pill");

      function positionDesktopTodayIndicator() {
        if (!desktopTodayIndicatorEl || !pillEl || window.matchMedia("(max-width: 599px)").matches)
          return;
        const todayCell = pillEl.querySelector<HTMLElement>(".detail-schedule-label-cell--today");

        if (!todayCell) {
          desktopTodayIndicatorEl.classList.add("hidden");

          return;
        }

        desktopTodayIndicatorEl.classList.remove("hidden");

        const top =
          pillEl.offsetTop +
          todayCell.offsetTop +
          todayCell.offsetHeight / 2 -
          desktopTodayIndicatorEl.offsetHeight / 2;

        desktopTodayIndicatorEl.style.top = `${top}px`;
      }

      positionDesktopTodayIndicator();
      window.addEventListener("resize", positionDesktopTodayIndicator, {
        signal: this._scheduleEvents.signal,
      });

      // Re-position the indicator when resizing from desktop → mobile, because
      // offsetLeft/offsetWidth read as 0 while the selector is display:none.
      const mobileQuery = window.matchMedia("(max-width: 599px)");
      mobileQuery.addEventListener(
        "change",
        (e) => {
          if (e.matches) {
            daySelector.refresh();
            selectScheduleDay(selectedDayIndex, { silent: true, animate: false });
            positionDetailTodayIndicator();
          } else {
            positionDesktopTodayIndicator();
          }
        },
        { signal: this._scheduleEvents.signal },
      );

      // ---------- TIMELINE HOVER ----------
      const cursorRoots = new Map<HTMLElement, Root>();
      let _activeBar: HTMLElement | null = null;
      container.addEventListener(
        "mousemove",
        (e) => {
          const bar =
            e.target instanceof Element
              ? e.target.closest<HTMLElement>(".detail-schedule-bar")
              : null;

          if (_activeBar && _activeBar !== bar) {
            const prevCursor = _activeBar
              .closest<HTMLElement>(".detail-schedule-bar-wrapper")
              ?.querySelector<HTMLElement>(".timeline-hover-cursor");

            if (prevCursor) prevCursor.hidden = true;
            const prevLine = _activeBar.querySelector<HTMLElement>(".timeline-hover-line");

            if (prevLine) prevLine.hidden = true;
            _activeBar = null;
          }

          if (!bar) return;
          _activeBar = bar;

          const wrapper = bar.closest<HTMLElement>(".detail-schedule-bar-wrapper");
          const cursor = wrapper?.querySelector<HTMLElement>(".timeline-hover-cursor");
          const line = bar.querySelector<HTMLElement>(".timeline-hover-line");

          if (!cursor || !line) return;

          const rect = bar.getBoundingClientRect();
          const isMobileVertical = window.matchMedia("(max-width: 599px)").matches;

          const fraction = isMobileVertical
            ? Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
            : Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

          const minutes = Math.round(DAY_START + fraction * total);
          const pct = `${(fraction * 100).toFixed(2)}%`;

          if (isMobileVertical) {
            cursor.style.top = pct;
            cursor.style.left = "";
            line.style.top = pct;
            line.style.left = "";
          } else {
            cursor.style.left = pct;
            cursor.style.top = "";
            line.style.left = pct;
            line.style.top = "";
          }

          let cursorRoot = cursorRoots.get(cursor);

          if (!cursorRoot) {
            cursorRoot = createRoot(cursor);
            cursorRoots.set(cursor, cursorRoot);
          }

          flushSync(() => cursorRoot.render(minutesToTimeDisplay(minutes)));
          cursor.hidden = false;
          line.hidden = false;
        },
        { signal: this._scheduleEvents.signal },
      );
      container.addEventListener(
        "mouseleave",
        () => {
          if (_activeBar) {
            const prevCursor = _activeBar
              .closest<HTMLElement>(".detail-schedule-bar-wrapper")
              ?.querySelector<HTMLElement>(".timeline-hover-cursor");

            if (prevCursor) prevCursor.hidden = true;
            const prevLine = _activeBar.querySelector<HTMLElement>(".timeline-hover-line");

            if (prevLine) prevLine.hidden = true;
            _activeBar = null;
          }
        },
        { signal: this._scheduleEvents.signal },
      );

      // ---------- TIMELINE OCCUPATION POPOVER ----------
      // One popover reused for every block; it lives on <body>, so it is
      // destroyed with the rest of this render (see _timelinePopoverCleanup).
      const timelinePopover = createPopover({
        placement: "top",
        role: "tooltip",
        dismissable: false,
      });

      timelinePopover.el.style.setProperty("--lg-popover-max-width", "min(280px, 70vw)");

      const timelinePopoverBody = document.createElement("div");

      timelinePopoverBody.className = "timeline-popover-body";
      timelinePopover.setContent(timelinePopoverBody);

      const popoverRoot = createRoot(timelinePopoverBody);
      let _popoverBlock: HTMLElement | null = null;

      const showOccupationPopover = (blockEl: HTMLElement) => {
        const slot = scheduleSlots[Number(blockEl.dataset.slotIdx)];

        if (!slot) return;
        flushSync(() => popoverRoot.render(<OccupationPopover slot={slot} />));
        _popoverBlock = blockEl;
        timelinePopover.show(blockEl);
      };

      const hideOccupationPopover = () => {
        _popoverBlock = null;
        timelinePopover.hide();
      };

      // Scroll to and open the popover on the searched lesson — once per open,
      // so a later re-render (language switch, refreshOccupancy) doesn't jump
      // the page back or re-pop it after the user has moved on.
      if (this._highlight && !this._highlightConsumed) {
        this._highlightConsumed = true;

        const primaryBlock = container.querySelector<HTMLElement>(
          ".detail-schedule-block--highlight",
        );

        if (primaryBlock) {
          const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          primaryBlock.scrollIntoView({
            block: "center",
            behavior: reduceMotion ? "auto" : "smooth",
          });
          showOccupationPopover(primaryBlock);
        }
      }

      {
        // Desktop hover
        let _hoveredBlock: HTMLElement | null = null;
        container.addEventListener(
          "pointerover",
          (e) => {
            if (e.pointerType && e.pointerType !== "mouse") return;

            const block =
              e.target instanceof Element
                ? e.target.closest<HTMLElement>(".detail-schedule-block")
                : null;

            if (!block || block === _hoveredBlock) return;
            _hoveredBlock = block;
            showOccupationPopover(block);
          },
          { signal: this._scheduleEvents.signal },
        );
        container.addEventListener(
          "pointerout",
          (e) => {
            if (e.pointerType && e.pointerType !== "mouse") return;

            const block =
              e.target instanceof Element
                ? e.target.closest<HTMLElement>(".detail-schedule-block")
                : null;

            if (!block || block !== _hoveredBlock) return;
            _hoveredBlock = null;
            hideOccupationPopover();
          },
          { signal: this._scheduleEvents.signal },
        );

        // Keyboard focus (mirrors hover for accessibility)
        container.addEventListener(
          "focusin",
          (e) => {
            const block =
              e.target instanceof Element
                ? e.target.closest<HTMLElement>(".detail-schedule-block")
                : null;

            if (block) showOccupationPopover(block);
          },
          { signal: this._scheduleEvents.signal },
        );
        container.addEventListener(
          "focusout",
          (e) => {
            const block =
              e.target instanceof Element
                ? e.target.closest<HTMLElement>(".detail-schedule-block")
                : null;

            if (block) hideOccupationPopover();
          },
          { signal: this._scheduleEvents.signal },
        );

        // Tap / click toggles — this is the primary interaction on mobile
        container.addEventListener(
          "click",
          (e) => {
            const block =
              e.target instanceof Element
                ? e.target.closest<HTMLElement>(".detail-schedule-block")
                : null;

            if (!block) {
              hideOccupationPopover();

              return;
            }

            e.stopPropagation();

            if (_popoverBlock === block) hideOccupationPopover();
            else showOccupationPopover(block);
          },
          { signal: this._scheduleEvents.signal },
        );

        // Close on any interaction outside the schedule area (e.g. tapping the room title).
        const onDocClick = (e: MouseEvent) => {
          if (!(e.target instanceof Node) || !container.contains(e.target)) hideOccupationPopover();
        };

        document.addEventListener("click", onDocClick, { signal: this._scheduleEvents.signal });

        // Close on scroll. The popover is positioned in fixed/viewport coordinates
        // and doesn't track the trigger as the page scrolls, so once the trigger
        // moves the popover would otherwise be left floating over the wrong spot.
        // On desktop this already happens implicitly (scrolling moves the hovered
        // block out from under a stationary cursor, firing pointerout), but a tap
        // on mobile leaves the popover open with no such gesture to close it.
        const onScroll = () => hideOccupationPopover();
        window.addEventListener("scroll", onScroll, {
          capture: true,
          passive: true,
          signal: this._scheduleEvents.signal,
        });
      }

      this._timelinePopoverCleanup = () => {
        daySelector.destroy();
        timelinePopover.destroy();
        popoverRoot.unmount();
        cursorRoots.forEach((root) => root.unmount());
      };
    } catch (err) {
      console.error("ClassroomDetail: Error rendering schedule:", err);
      flushSync(() =>
        this._scheduleRoot?.render(
          <Fragment key={this._scheduleRevision}>
            <p className={"secondary"}>{t("detail.noData")}</p>
          </Fragment>,
        ),
      );
    }
  }
}

export const classroomDetail = new ClassroomDetail();
