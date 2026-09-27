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
import type { Building, Campus, ClassroomEntry, Occupation, OccupancyDay } from "../types";
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
}

interface OpenTrigger {
  cardEl: HTMLElement;
  queryContext: QueryContext | null;
  highlight: ScheduleHighlight | null;
}

type HeaderHeightMode = "list" | "detail";

type HeaderHeights = Partial<Record<HeaderHeightMode, string>>;

interface PhotoState {
  visible: boolean;
  gradient: boolean;
  url?: string;
  loaded: boolean;
  backdropUrl?: string;
  backdropPrerendered: boolean;
}

interface PhotoHandle {
  show(): void;
  hide(): void;
  reveal(url: string): void;
  load(url: string): HTMLImageElement | null;
  setBackdrop(url: string, prerendered: boolean): void;
}

function DetailPhoto({ ref, classroomId }: { ref: Ref<PhotoHandle>; classroomId: number | null }) {
  const [photo, setPhoto] = useState<PhotoState>({
    visible: true,
    gradient: true,
    loaded: false,
    backdropPrerendered: false,
  });

  const img = useRef<HTMLImageElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      show() {
        flushSync(() =>
          setPhoto((current) =>
            current.visible
              ? current
              : { visible: true, gradient: false, loaded: false, backdropPrerendered: false },
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
      setBackdrop(url, prerendered) {
        flushSync(() =>
          setPhoto((current) => ({
            ...current,
            backdropUrl: url,
            backdropPrerendered: prerendered,
          })),
        );
      },
    }),
    [],
  );

  if (!photo.visible) return null;

  return (
    <>
      <div
        className={`detail-photo-backdrop${photo.backdropUrl ? " loaded" : ""}${photo.backdropPrerendered ? " prerendered" : ""}`}
        style={
          photo.backdropUrl
            ? cssVars({ "--backdrop-img": `url("${photo.backdropUrl}")` })
            : undefined
        }
      />
      <div className={`detail-photo-container${photo.loaded ? " loaded" : ""}`}>
        <img
          ref={img}
          className={`detail-photo${photo.loaded ? " loaded" : ""}`}
          alt=""
          src={photo.url}
          onError={() => {
            if (classroomId !== null) markPhotoBroken(classroomId);
            setPhoto((current) => ({ ...current, visible: false }));
          }}
        />
        {photo.gradient && <div className="detail-photo-gradient" />}
      </div>
    </>
  );
}

import { isNumber, supportsViewTransitions } from "../../lib/guards";
import { openPage, closePage, goBack } from "../../lib/navigation";
import {
  classroomsData as occupancyData,
  SKIP_DAYS,
  getClassroomStatusNow,
  getBuildingOpening,
  getRomeNow,
  romeMinutesOfDay,
} from "../available-rooms-script.ts";
import { t, getLocale, onLanguageSwitch } from "../i18n.ts";
import { createTimeFormatter } from "../utils/time-format.ts";
import { infoPage } from "./info-page.tsx";
import {
  fetchPhotoUrl,
  photoUrlCache,
  fetchThumbUrl,
  thumbUrl,
  thumbUrlCache,
  extractPhotoColor,
  blurredBackdrop,
  getCachedPhotoColor,
  getCachedPhotoLuminance,
  getCachedPhotoAverageLuminance,
  markPhotoBroken,
  isPhotoBroken,
  type BackdropBox,
} from "../utils/photo.ts";
import { isFavourite, toggleFavourite } from "../utils/favourites.ts";
import { createPopover, createButton, createSegmentedControl } from "vitrium";
import { setZoomOrigin, clearZoomOrigin, cardRadius } from "../utils/vt-motion.ts";
import { refreshHeaderBlur } from "../utils/header-blur.ts";
import { createPillSelector } from "./pill-selector.ts";
import {
  embedMap,
  parkMap,
  releaseMap,
  getEmbedPov,
  setEmbedPov,
  isMapTabShowing,
} from "./campus-map.tsx";
import { startTrackedTransition, vtFlag } from "../utils/vt-debug.ts";
import { dismissSearchOverlayInstant } from "./search-overlay-controller.ts";

// No zoom and no shared element when motion is unwelcome: the pair of them is
// the whole animation, so what is left is the browser's own cross-fade.
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

/** Animation.currentTime is CSSNumberish | null; only the plain-number form can be nudged. */
function hasNumericCurrentTime(a: Animation): a is Animation & { currentTime: number } {
  return typeof a.currentTime === "number";
}

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

/** Name of an occupancy slot: the parsed course/exam title when there is one, the raw scraped text otherwise. */
function occupationTitle(slot: Occupation) {
  return (
    (slot.category === "COURSE" || slot.category === "EXAM" ? slot.course : slot.raw) ??
    slot.name ??
    t("detail.occupied")
  );
}

/** Time range of an occupancy slot, as shown in the popover and read out by screen readers. */
function occupationTimeRange(slot: Occupation) {
  return `${minutesToTimeDisplay(timeToMinutes(slot.inizio))} – ${minutesToTimeDisplay(timeToMinutes(slot.fine))}`;
}

// Builds the popover body for a single occupancy slot. Course/exam slots carry
// structured fields (course, code, professors, section); anything the scrape
// couldn't parse only has `raw`; very old cached data may only have `name`.
function OccupationPopover({ slot }: { slot: Occupation }) {
  const timeRange = occupationTimeRange(slot);
  const titleText = occupationTitle(slot);
  const metaLines: ReactNode[] = [];

  if (slot.category === "COURSE" || slot.category === "EXAM") {
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
  _enteredId: number | null = null;
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
  _vtSettled: Promise<void> | null = null; // pending open/close transition, see _beginTransition
  _vtResolve: (() => void) | null = null;
  _headerHeights: HeaderHeights = {};
  _backdropBox: BackdropBox | null = null;
  _mapObserver: IntersectionObserver | null = null; // waits for the map section to come into view
  _mapTimer = 0; // ...and then for the page to settle
  _reflowObservers: ResizeObserver[] = [];
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
  /** Tears down all timers, listeners, and React roots owned by this instance. */
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
    this._cancelMapEmbed();
    releaseMap();
    this._reflowObservers.forEach((o) => o.disconnect());
    this._reflowObservers = [];
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

  /** Called by the React application lifecycle after the directory loads. */
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

    // The dark-mode dimming and the title tone both depend on the theme, so
    // redo them for the open photo when the device theme flips at runtime.
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener(
      "change",
      () => {
        const url = this._currentId === null ? null : thumbUrl(this._currentId);

        if (url) this._applyPhotoTone(url);
      },
      { signal: this._events.signal },
    );

    // Flags the overlay once the sticky title row reaches its stuck position
    // (see the title-stuck rules in classroom-detail.css), and measures how far
    // the title must slide to clear the back button: from where the row's
    // content starts to 0.5rem past the button's right edge, whatever the
    // width / scrollbar / centred column. Listens in the capture phase so it
    // works whichever element is the scroller.
    let stuckFrame = 0;

    const syncTitleStuck = () => {
      stuckFrame = 0;
      const overlay = this._overlay;

      if (!overlay) return;
      const row = overlay.querySelector<HTMLElement>(".detail-title-row");
      let stuck = false;

      if (row && !overlay.hidden && getComputedStyle(row).position === "sticky") {
        const cs = getComputedStyle(row);
        const top = parseFloat(cs.top);
        const rect = row.getBoundingClientRect();

        const scrolled = window.scrollY > 0 || overlay.scrollTop > 0 || document.body.scrollTop > 0;
        stuck = scrolled && rect.top <= top + 0.5;
        const back = document.getElementById("detail-back-btn");

        if (back && !back.hidden) {
          const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

          const shift =
            back.getBoundingClientRect().right +
            0.5 * rem -
            (rect.left + parseFloat(cs.paddingLeft));

          overlay.style.setProperty("--title-shift", `${Math.round(shift)}px`);
        }
      }

      overlay.classList.toggle("title-stuck", stuck);
    };

    const queueTitleStuck = () => {
      if (!stuckFrame) {
        stuckFrame = this._frame(() => {
          syncTitleStuck();
        });
      }
    };

    document.addEventListener("scroll", queueTitleStuck, {
      passive: true,
      capture: true,
      signal: this._events.signal,
    });
    window.addEventListener("resize", queueTitleStuck, { signal: this._events.signal });

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

      if (this._hasPhoto(entry.classroom)) this._loadPhoto(this._currentId);
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

    // A card's photo color and pre-blurred backdrop, made while the finger is
    // still down: the first open of a room otherwise loads its thumbnail again
    // and reads its pixels (~10ms on an older phone) before the transition can
    // start, and renders the backdrop inside it. Cached per photo, so a press
    // that turns into a scroll costs them only once.
    document.addEventListener(
      "pointerdown",
      (e) => {
        const trigger =
          e.target instanceof Element
            ? e.target.closest<HTMLElement>("[data-open-classroom]")
            : null;

        if (!trigger) return;
        const id = parseInt(trigger.dataset.openClassroom!);

        if (!thumbUrlCache.has(id)) return;
        const url = thumbUrl(id);

        void extractPhotoColor(url).then(() => {
          if (this._backdropBox && !vtFlag("liveblur")) blurredBackdrop(url, this._backdropBox);
        });
      },
      { signal: this._events.signal, passive: true },
    );

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

        const highlight =
          highlightDate && highlightFrom && highlightTo
            ? { date: highlightDate, from: highlightFrom, to: highlightTo }
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

    if (this._hasPhoto(entry.classroom)) this._loadPhoto(this._currentId);
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

  /** Closes the detail overlay without the close animation, e.g. when navigating to the info page. */
  _silentClose() {
    if (!this._overlay || this._overlay!.hidden) return;
    this._currentId = null;
    this._enteredId = null;
    releaseMap();
    this._cancelMapEmbed();
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

  // ---------- TRANSITION PLUMBING ----------

  /* The page's end of the card morph: the hero photo. Null for a room with no
     photo, and deliberately so — there is nothing on that page for the card to
     become, and every stand-in is worse than none. The card's snapshot is
     `object-fit: cover`-ed into whatever box the morph lands on, so a stand-in
     the size of its box blows the card up by that box's scale.

     With no page-side element the card is alone in its group, the group stays
     at the card's own rect, and the `:only-child` rules in
     classroom-detail.css fade it out in place over the page growing out from
     under it. That is also what SwiftUI's `.zoom` does with nothing to pair up:
     the source view simply becomes the destination page. */
  _heroTarget() {
    return this._overlay?.querySelector<HTMLElement>(".detail-photo-container") ?? null;
  }

  /* The snapshot of the page a transition animates is live, so anything that
     moves on the page underneath it — the entrance animations, a transition,
     a glass surface's backdrop-filter — repaints that whole page layer, blurred
     backdrop and all, on every frame of the zoom. .detail-vt-freeze (see
     classroom-detail.css) holds all of it still for the length of the
     transition; ?vtdebug=live turns that off, for comparison.

     It goes on the parts it holds still, not on <html>, and the container
     around the whole page gets a class of its own: Chrome restyles everything
     inside an element that gains a class with a rule ending in `*`, whichever
     element that rule was written for. On <html>, or on that container, it
     restyled all of the page (~20-30ms on an older phone), in the very frame
     the transition captures the old state in. */
  _freezeTargets(): [Element, string][] {
    const candidates: [Element | null, string][] = [
      [this._overlay, "detail-vt-freeze"],
      [document.querySelector(".header"), "detail-vt-freeze"],
      [document.querySelector(".body-container"), "detail-vt-snap"],
    ];

    return candidates.filter((pair): pair is [Element, string] => !!pair[0]);
  }

  _freezeForTransition({ page = true } = {}) {
    if (vtFlag("live")) return;

    for (const [el, cls] of this._freezeTargets()) {
      if (el === this._overlay && !page) continue;
      el.classList.add(cls);
    }
  }

  _unfreeze() {
    for (const [el, cls] of this._freezeTargets()) el.classList.remove(cls);
  }

  /* --header-height is normally kept live by a ResizeObserver, but that fires
     too late for a transition, which captures its new state synchronously
     right after its update callback: the photo's margin-top (which reads it)
     used the other mode's header height for the whole animation, and the
     "tucked behind the header" look only snapped in once it ended. So the
     callbacks set it themselves, in two steps: first what the header measured
     the last time the page was in this mode, before anything reads layout,
     then checked once layout is up to date. It's on <html>, so every change to
     it restyles the whole page; measuring first and writing after cost a
     second full pass. */
  _presetHeaderHeight(mode: HeaderHeightMode) {
    const h = this._headerHeights[mode];

    if (h) document.documentElement.style.setProperty("--header-height", h);
  }

  _checkHeaderHeight(mode: HeaderHeightMode, headerEl: HTMLElement | null) {
    if (!headerEl) return;
    const h = `${headerEl.offsetHeight}px`;

    this._headerHeights[mode] = h;

    if (document.documentElement.style.getPropertyValue("--header-height") !== h) {
      document.documentElement.style.setProperty("--header-height", h);
    }
  }

  /* Holds the page at `y` on every frame until the returned function is
     called. Mobile Safari runs a flick's glide outside the page and reports
     where it stopped a moment later; tap a card as the glide ends and that
     report can land after the open's own scrollTo(0, 0), putting the page
     back at the list's offset (clamped: the page's bottom). The transition's
     live snapshot then showed the page's bottom for the whole zoom, and the
     jump to the top came when cleanup reset it. Held, a late report is undone
     on the next frame, while the box is still small. */
  _pinScroll(y: number) {
    let raf = 0;

    const hold = () => {
      if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
      raf = requestAnimationFrame(hold);
    };

    raf = requestAnimationFrame(hold);

    return () => cancelAnimationFrame(raf);
  }

  /* The entrance animations (feature chips, schedule blocks, the Today badge)
     were created paused under the freeze, and their delays count from the tap.
     Spend as much of them as the zoom already took — all by the same amount,
     so a stagger stays a stagger — and let them go: the first of them starts
     the moment the zoom lands instead of a delay after it. */
  _releaseFreeze(since: number) {
    if (!this._overlay?.classList.contains("detail-vt-freeze")) return;

    const anims = (this._overlay.getAnimations?.({ subtree: true }) ?? []).filter(
      (a) => a.playState === "paused" && hasNumericCurrentTime(a),
    );

    const delays = anims
      .map((a) => (a.effect instanceof KeyframeEffect ? (a.effect.getTiming().delay ?? 0) : 0))
      .filter((d) => d > 0);

    const skip = delays.length ? Math.min(performance.now() - since, ...delays) : 0;

    if (skip > 0) {
      for (const a of anims) {
        if (hasNumericCurrentTime(a)) a.currentTime += skip;
      }
    }

    this._unfreeze();
  }

  /* Anything that blocks the main thread while the snapshots are animating is
     a stutter in the animation, so work that can wait (the map's WebGL boot,
     mainly) waits on this. */
  _beginTransition() {
    if (this._vtSettled) return;
    this._vtSettled = new Promise<void>((resolve) => {
      this._vtResolve = resolve;
    });
  }

  _settleTransition() {
    refreshHeaderBlur();
    const resolve = this._vtResolve;
    this._vtSettled = null;
    this._vtResolve = null;
    resolve?.();
  }

  _afterTransition(fn: () => void) {
    if (this._vtSettled) void this._vtSettled.then(fn);
    else fn();
  }

  /* The header's progressive blur samples whatever is painted behind it, and
     on this page that is the hero photo. refreshHeaderBlur() runs when the
     transition settles, which covers a photo that was already cached and
     stamped inside the transition, and misses one that was not: a cold room has
     to resolve /v1/photos/:id, fetch the bytes and decode them first, so its
     photo lands well after. Safari then keeps the blur it sampled over the
     empty skeleton until something else forces a repaint. So: refresh again
     when the photo is actually up. */
  _photoRevealed() {
    refreshHeaderBlur();
  }

  /**
   * Whether a room has a usable photo: it has an idfoto AND that photo hasn't
   * already failed to load this session. A room whose photo 404s (a stale
   * idfoto) removes its photo container on error, which — mid view-transition —
   * ends the transition instantly and yanks everything below it up by the
   * photo's height (the whole page "snaps"). Remembering the failure here keeps
   * every later open from naming a hero for a photo that isn't there.
   */
  _hasPhoto(classroom: { idfoto?: string | number | null; id: number }) {
    return !!classroom.idfoto && !isPhotoBroken(classroom.id);
  }

  /* The backdrop's blurred box as its CSS lays it out, for the next open to
     pre-render: it only depends on the viewport, so the last open's is the
     next one's. Read after the transition, when style is already up to date. */
  _measureBackdrop() {
    const el = this._backdropEl();

    if (!el) return;
    const cs = getComputedStyle(el, "::before");

    const box: BackdropBox = {
      width: parseFloat(cs.width),
      height: parseFloat(cs.height),
      bleed: parseFloat(cs.paddingLeft),
      blur: parseFloat(cs.getPropertyValue("--bd-blur-px")),
      repeatY: cs.getPropertyValue("--bd-repeat").trim() !== "repeat-x",
    };

    if (box.width > 0 && box.height > 0 && box.blur > 0) this._backdropBox = box;
  }

  _cancelMapEmbed() {
    this._mapObserver?.disconnect();
    this._mapObserver = null;
    clearTimeout(this._mapTimer);
    this._mapTimer = 0;
  }

  /* Booting the map is the most expensive thing on this page by a distance:
     fetching the token, parsing mapbox-gl, building a WebGL context and its
     first tiles, all on the main thread. Doing that inside the view
     transition's update callback is what made the very first open of any
     detail page stutter.

     So it waits for three things: the map section coming close to the viewport
     (a reader who doesn't scroll down there never pays for it at all), the
     transition being over, and then a beat longer — a room with no photo has a
     short page, so the map section is already in range when it opens, and the
     page's own entrance animations are still running for another half second. */
  _scheduleMapEmbed(host: HTMLElement, opts: Parameters<typeof embedMap>[1]) {
    this._cancelMapEmbed();

    const start = () => {
      this._mapObserver?.disconnect();
      this._mapObserver = null;
      this._afterTransition(() => {
        const run = () => {
          if (!host.isConnected) return;
          void embedMap(host, opts);
        };

        const idle = () => {
          if ("requestIdleCallback" in window) {
            requestIdleCallback(run, { timeout: 500 });
          } else {
            run();
          }
        };

        // Long enough for the page's own entrance animations to be over.
        this._mapTimer = window.setTimeout(idle, 600);
      });
    };

    if (!("IntersectionObserver" in window)) {
      start();

      return;
    }

    this._mapObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) start();
      },
      { rootMargin: "600px 0px" },
    );
    this._mapObserver.observe(host);
  }

  // ---------- OPEN ----------

  /** Opens the detail overlay for a classroom, carrying over any query context or search highlight from the trigger. */
  async _doOpen(id: number, pending: OpenTrigger | null) {
    const generation = this._generation;

    if (!this._overlay) return;
    this._buildFlatIndex();

    const entry = this._flatIndex?.get(id);

    if (!entry) return;

    if (this._currentId !== id) document.documentElement.style.removeProperty("--detail-tint");
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

    // Photo VT: if the room's photo is already cached, pre-decode it so the
    // detail photo is bitmap-ready when the VT snapshots the new state. The
    // thumbnail the card was showing, by preference: already decoded, and a
    // fraction of the full photo to upload and draw on every frame of the zoom.
    // _loadPhoto swaps the full photo in once the page has landed.
    let hasPhoto = this._hasPhoto(entry.classroom);
    let validPhotoUrl = hasPhoto ? (thumbUrlCache.get(id) ?? photoUrlCache.get(id) ?? null) : null;

    if (validPhotoUrl) {
      const tmp = new Image();
      tmp.src = validPhotoUrl;

      const decoded = await tmp
        .decode()
        .then(() => true)
        .catch(() => false);

      if (this._currentId !== id || generation !== this._generation) return; // navigated away during decode

      // Decode failed (a 404 from a stale idfoto, mostly): the room opens as a
      // photo-less one. Opened as a room with a photo, it paired the card with
      // an empty photo box, and the photo's error handler then removed that box
      // mid-zoom: removing a named element ends the transition on the spot (the
      // snap), and everything below it jumped up by the photo's height.
      if (!decoded) {
        markPhotoBroken(id);
        hasPhoto = false;
        validPhotoUrl = null;
      }

      // Warm the tint cache too, so _setBackdrop can apply --detail-tint
      // synchronously inside the VT callback (the "new" snapshot is taken
      // right after it, before any async extraction could land).
      if (validPhotoUrl) await extractPhotoColor(thumbUrl(id));

      if (this._currentId !== id || generation !== this._generation) return;
    }

    if (supportsViewTransitions()) {
      // -- SwiftUI .zoom-style open: the whole page grows out of the card's
      // rounded box (a transform + clip on the root snapshot, see
      // utils/vt-motion.ts), while the card and the page's hero photo morph
      // into each other as one shared element on top of it. --
      const cardEl = pending?.cardEl ?? null;
      const cardInDom = !!(cardEl && document.body.contains(cardEl));

      // No card to zoom from (hash navigation, info -> detail): leave the root
      // cross-fade alone instead of inventing an origin for the page to fly
      // out of.
      const zoomingCard =
        cardInDom && !reduceMotion?.matches
          ? setZoomOrigin(cardEl.getBoundingClientRect(), cardRadius(cardEl))
            ? cardEl
            : null
          : null;

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

      // Only when the page has a hero for it to become. A room with no photo
      // has none, and naming the card anyway put its snapshot on top of the
      // growing page at its own unscaled size, so the card's title showed over
      // the page's title. Unnamed, the card stays in the list's snapshot, which
      // does not move, and the page's box covers it from frame one.
      if (zoomingCard && hasPhoto) zoomingCard.style.viewTransitionName = "detail-hero";

      // The page's end of the morph, resolved inside the callback.
      let heroTargetEl: HTMLElement | null = null;
      // When the page's animations were created, for _releaseFreeze.
      let frozenAt = performance.now();
      let unpinScroll: (() => void) | null = null;

      this._beginTransition();

      // Strip the glass blur off the scaling header controls for the transition
      // (see .header-ctl-vt in classroom-detail.css).
      document.documentElement.classList.add("header-ctl-vt");
      this._freezeForTransition();

      // Direction of the zoom (see .detail-vt-open in classroom-detail.css).
      if (zoomingCard) document.documentElement.classList.add("detail-vt-open");

      const vt = startTrackedTransition(
        "open",
        () => {
          if (this._disposed || generation !== this._generation) return;
          frozenAt = performance.now();
          dismissSearchOverlayInstant();

          if (fromInfo) {
            infoPage._applyReturnVT();
          } else if (this._tabbar) {
            this._tabbar.classList.add("detail-open");
          }

          if (zoomingCard) zoomingCard.style.viewTransitionName = "";

          // The list's header height, for the close to preset (the page has only
          // ever been in list mode before the first open).
          this._headerHeights.list ??=
            document.documentElement.style.getPropertyValue("--header-height") || undefined;

          // Everything this changes first, then everything it measures: a read of
          // layout after a change restyles and lays out the page again, and
          // .detail-open restyles all of it. --header-height is normally kept live
          // by a ResizeObserver, but that fires asynchronously — too late for the
          // VT, which snapshots the "new" state synchronously right after this
          // callback returns. Without presetting it here, the photo's margin-top
          // (which reads that var) uses the stale, pre-detail-open header height
          // for the whole animation, so the "tucked behind the header" look only
          // snaps in once the transition ends and the real DOM/ResizeObserver
          // catch up.
          document.body.classList.add("detail-open");
          this._presetHeaderHeight("detail");
          this._overlay!.removeAttribute("hidden");
          this._renderContent(entry);
          this._overlay!.classList.add("visible");

          if (this._backBtn) this._backBtn.removeAttribute("hidden");

          if (this._favBtn) {
            this._favBtn.removeAttribute("hidden");
            this._syncFavBtn();
          }

          if (validPhotoUrl) {
            this._photo.current?.reveal(validPhotoUrl);
            this._setBackdrop(thumbUrl(id));
          }

          this._loadSchedule(id);

          this._checkHeaderHeight("detail", headerEl);
          window.scrollTo(0, 0);
          unpinScroll = this._pinScroll(0);

          // The card's counterpart: the hero photo, which the page's zoom lands
          // exactly on top of. Named after the layout flush below so it is
          // captured at its settled size (siblings hidden via .detail-open
          // above), and only when there is a card to morph out of.
          void this._overlay!.offsetHeight;

          if (zoomingCard) {
            heroTargetEl = this._heroTarget();

            if (heroTargetEl) {
              heroTargetEl.style.viewTransitionName = "detail-hero";
              document.documentElement.classList.add("detail-vt-hero");
            }
          }

          if (hasPhoto) this._loadPhoto(id);
        },
        () => ({ zoom: !!zoomingCard, hero: !!heroTargetEl }),
      );

      const cleanup = () => {
        unpinScroll?.();

        if (generation !== this._generation) return;

        if (heroTargetEl) heroTargetEl.style.viewTransitionName = "";

        if (cardEl) cardEl.style.viewTransitionName = "";

        if (headerEl) headerEl.style.viewTransitionName = "";
        document.documentElement.classList.remove(
          "header-ctl-vt",
          "detail-vt-open",
          "detail-vt-hero",
        );
        this._releaseFreeze(frozenAt);
        this._measureBackdrop();
        clearZoomOrigin();

        if (fromInfo) infoPage._cleanupReturnVT();
        this._settleTransition();

        // Nothing scrolls while the snapshots are up, so a non-zero offset here
        // is one the page kept from before (Safari restoring one as the
        // document's height changes, mostly) rather than the reader's doing.
        if (this._currentId === id && window.scrollY !== 0) window.scrollTo(0, 0);
      };

      // A second VT firing before this one settles rejects .ready/.finished with
      // InvalidStateError; .finished is handled above, but .ready isn't awaited
      // anywhere, so it was surfacing as an unhandled rejection on every abort.
      vt.ready.catch(() => {});
      vt.finished.then(cleanup).catch(cleanup);
    } else {
      // Fallback: show overlay, swap tabbar for back button without animation
      dismissSearchOverlayInstant();

      if (fromInfo) {
        infoPage._applyReturnVT();
      } else {
        if (this._tabbar) this._tabbar.classList.add("detail-open");
      }

      document.body.classList.add("detail-open");
      this._overlay!.removeAttribute("hidden");
      this._renderContent(entry);

      // Stamp cached photo immediately in the fallback path too
      if (validPhotoUrl) {
        this._photo.current?.reveal(validPhotoUrl);
        this._setBackdrop(thumbUrl(id));
      }

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

  /** Closes the detail overlay with its close animation, resetting the open/query/highlight state. */
  _doClose() {
    const generation = this._generation;

    if (!this._overlay || this._overlay!.hidden) return;

    this._currentId = null;
    this._enteredId = null;

    const cardEl = this._openTrigger?.cardEl ?? null;
    const cardInDom = !!(cardEl && document.body.contains(cardEl));
    const headerEl = document.querySelector<HTMLElement>(".header");

    const cleanup = () => {
      if (generation !== this._generation) return;
      releaseMap();
      this._cancelMapEmbed();
      this._clearContent();
      this._openTrigger = null;
      this._queryContext = null;
      this._highlight = null;
      this._overlay!.style.viewTransitionName = "";

      if (headerEl) headerEl.style.viewTransitionName = "";
      document.documentElement.classList.remove(
        "header-vt-fixed",
        "header-ctl-vt",
        "detail-vt-close",
        "detail-vt-hero",
      );
      this._unfreeze();
      clearZoomOrigin();

      if (cardEl) {
        cardEl.style.viewTransitionName = "";
        cardEl.style.removeProperty("content-visibility");
      }

      this._settleTransition();

      // The list's own position: restored inside the callback, but the document
      // is still growing back to its full height at that point, so the browser
      // may have clamped it short. Now that it has settled, put it where it
      // belongs.
      if (this._currentId === null && Math.abs(window.scrollY - this._savedScrollPos) > 1) {
        window.scrollTo(0, this._savedScrollPos);
      }
    };

    if (supportsViewTransitions()) {
      // content-visibility: auto skips rendering off-screen cards, which would make
      // the VT new-state snapshot blank. Force it visible here so the card's
      // subtree is rendered when the VT captures it after scrollTo().
      if (cardInDom) cardEl.style.contentVisibility = "visible";

      // See _doOpen: the header is pinned as its own group so its frozen
      // snapshot always shows the already-correct blur, instead of being
      // lumped into root and frozen mid-way through the wrong state.
      if (headerEl) headerEl.style.viewTransitionName = "app-header";

      // The hero the page shrinks into the card around. Only worth pulling out
      // of the page when there is a card waiting for it on the other side.
      const heroEl = cardInDom && !reduceMotion?.matches ? this._heroTarget() : null;

      if (heroEl) heroEl.style.viewTransitionName = "detail-hero";
      let zoomed = false;

      this._beginTransition();

      // Strip the glass blur off the scaling header controls for the transition
      // (see .header-ctl-vt in classroom-detail.css).
      document.documentElement.classList.add("header-ctl-vt");

      // Set before the old state is captured, which is the page here. The page
      // itself only needs it in Safari, which keeps compositing a
      // backdrop-filter live even inside an old snapshot; elsewhere that
      // snapshot is a still image, and freezing the page would only restyle
      // all of it in the frame the snapshot is taken in.
      this._freezeForTransition({
        page: !document.documentElement.classList.contains("no-safari"),
      });

      const vt = startTrackedTransition(
        "close",
        () => {
          if (this._disposed || generation !== this._generation) return;
          // -- DOM changes (defines NEW state) --

          // Fully hide the overlay and back button
          document.body.classList.remove("detail-open");
          this._overlay!.setAttribute("hidden", "");
          this._overlay!.classList.remove("visible");

          if (this._backBtn) this._backBtn.setAttribute("hidden", "");

          if (this._favBtn) this._favBtn.setAttribute("hidden", "");

          this._presetHeaderHeight("list");

          if (headerEl) {
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
          this._checkHeaderHeight("list", headerEl);

          // Hand the shared map back to the Campus tab now, so this transition's
          // new-state snapshot already shows it (releasing in cleanup() left the
          // tab map-less until the animation ended). The tab's container just
          // regained its size above; flush layout so the map resizes into it.
          // Only when that is the tab we are going back to, though: releasing
          // resizes the WebGL canvas, jumps the camera and pulls in fresh tiles,
          // which then renders on every frame of the close — into a tab nobody
          // can see, whenever the page was opened from any other. cleanup()
          // releases it in that case.
          if (isMapTabShowing()) {
            void document.body.offsetHeight;
            releaseMap();
          }

          // Force a synchronous layout flush before naming the card, so its
          // resolved position/size (list re-scrolled above) is fully settled at
          // the exact moment the VT captures the "new" state geometry — and so
          // the rect the page shrinks into is the one the card really lands on.
          if (cardInDom && !reduceMotion?.matches) {
            void cardEl.offsetHeight;

            if (setZoomOrigin(cardEl.getBoundingClientRect(), cardRadius(cardEl))) {
              zoomed = true;
              document.documentElement.classList.add("detail-vt-close");

              // Named only against a real hero, the same way the open is: with
              // nothing to pair with, the card's snapshot would fade in at its
              // own small size on top of a page that is still full-screen.
              if (heroEl) {
                document.documentElement.classList.add("detail-vt-hero");
                cardEl.style.viewTransitionName = "detail-hero";
              }
            }
          }
        },
        () => ({ zoom: zoomed, hero: zoomed && !!heroEl }),
      );

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

    // Chips only stagger in when opening a classroom, not on re-renders
    // (occupancy refresh) of the one already showing.
    const enter = this._enteredId !== classroom.id;
    this._enteredId = classroom.id;

    const featuresHtml = (classroom.features ?? [])
      .filter((f) => FEATURE_ICONS.has(String(f.id)))
      .map(({ id }, i) => {
        const { icon, key } = FEATURE_ICONS.get(String(id))!;

        return (
          <div
            key={id}
            className={
              "detail-feature-chip liquid-glass" + (enter ? " detail-feature-chip--enter" : "")
            }
            data-feature-id={id}
            style={cssVars({ "--i": i })}
          >
            <i className={"hgi-stroke " + icon} aria-hidden={"true"}></i>
            <span>{t(key)}</span>
          </div>
        );
      });

    // building.hours is resolved upstream (building > campus default > global
    // default); opening hours are only defined per building, never per room.
    const hours =
      building.hours ??
      occupancyData
        .flatMap((d) => d.campuses ?? [])
        .find((c) => c.id === campus.id)
        ?.buildings?.find((b) => b.name === building.name)?.hours;

    let hoursHtml: ReactNode = null;

    if (hours) {
      const dow = new Date().getDay(); // 0 = Sunday

      const rows = [
        { key: "mon_fri", label: "detail.monFri", isToday: dow >= 1 && dow <= 5 },
        { key: "sat", label: "detail.saturday", isToday: dow === 6 },
        { key: "sun", label: "detail.sunday", isToday: dow === 0 },
      ] as const;

      hoursHtml = (
        <div className="detail-hours">
          {rows.map(({ key, label, isToday }) => {
            const range = hours[key];

            return (
              <div
                key={key}
                className={
                  "detail-hours-row" +
                  (isToday ? " detail-hours-row--today" : "") +
                  (range ? "" : " detail-hours-row--closed")
                }
              >
                <span className="detail-hours-day">{t(label)}</span>
                <span className="detail-hours-time">
                  {range ? `${range[0]} – ${range[1]}` : t("detail.closed")}
                </span>
              </div>
            );
          })}
        </div>
      );
    }

    const mapPoint =
      isNumber(building.lat) && isNumber(building.long)
        ? { lat: building.lat, long: building.long }
        : null;

    const mapLabel = building.altName?.trim() || `${t("building.prefix")} ${building.name}`;

    const status = getClassroomStatusNow(classroom.id);
    let statusHtml: ReactNode = null;

    if (status) {
      const statusKeys = {
        free: "status.free",
        occupied: "status.occupied",
        "free-soon": "status.freeSoon",
        "occupied-soon": "status.occupiedSoon",
        closed: "status.closed",
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

    this._overlay?.removeAttribute("data-title-tone");
    // The shared campus Map() may be sitting inside the old card — step it
    // out before the markup is replaced, or it would be destroyed with it.
    parkMap();
    this._overlay?.classList.remove("title-stuck");

    flushSync(() =>
      this._root?.render(
        <Fragment key={this._revision}>
          {this._hasPhoto(classroom) ? (
            <DetailPhoto ref={this._photo} classroomId={classroom.id} />
          ) : (
            ""
          )}
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
            <div className={"detail-column"}>
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
            <div className={"detail-column"}>
              {hoursHtml && (
                <section className={"detail-section"}>
                  <h2 className={"detail-section-title"}>{t("detail.openingHours")}</h2>
                  {hoursHtml}
                </section>
              )}
              {mapPoint && (
                <section className={"detail-section detail-map-section"}>
                  <h2 className={"detail-section-title"}>{t("detail.location")}</h2>
                  <div className={"detail-map"} />
                  <div className={"detail-map-links"} />
                </section>
              )}
            </div>
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

    if (mapPoint) {
      const links = this._overlay!.querySelector<HTMLElement>(".detail-map-links")!;

      const targets = [
        {
          href: `https://www.google.com/maps/search/?api=1&query=${mapPoint.lat},${mapPoint.long}`,
          icon: "google-maps",
          key: "detail.openGoogleMaps",
        },
        {
          href: `https://maps.apple.com/?ll=${mapPoint.lat},${mapPoint.long}&q=${encodeURIComponent(mapLabel)}`,
          icon: "apple-maps",
          key: "detail.openAppleMaps",
        },
      ];

      for (const { href, icon, key } of targets) {
        const img = new Image();
        img.className = "detail-map-link-icon";
        img.src = `/assets/${icon}.png`;
        img.alt = "";
        links.appendChild(
          createButton({
            icon: img,
            text: t(key),
            className: "detail-map-link",
            onClick: () => window.open(href, "_blank", "noopener,noreferrer"),
          }),
        );
      }

      const mapHost = this._overlay!.querySelector<HTMLElement>(".detail-map")!;
      const pov = document.createElement("div");
      pov.className = "detail-map-pov";
      mapHost.appendChild(pov);

      const segmented = createSegmentedControl(pov, {
        items: [
          { value: "2d", label: "2D" },
          { value: "3d", label: "3D" },
        ],
        value: getEmbedPov(),
        orientation: "vertical",
        blur: true,
        onSelect: setEmbedPov,
      });

      this._contentEvents.signal.addEventListener("abort", () => segmented.destroy(), {
        once: true,
      });

      this._scheduleMapEmbed(mapHost, {
        lat: mapPoint.lat,
        long: mapPoint.long,
        label: mapLabel,
        // Every building on the campus, for the 2D overview.
        siblings: campus.buildings.flatMap((b) =>
          isNumber(b.lat) && isNumber(b.long) ? [{ lat: b.lat, long: b.long }] : [],
        ),
      });
    } else {
      releaseMap();
    }

    this._animateMasonry(this._overlay!.querySelector<HTMLElement>(".detail-content"));

    // Title click -> manual refresh of photo and schedule
    const refreshOnActivate = () => {
      this._loadSchedule(classroom.id);

      if (this._hasPhoto(classroom)) this._loadPhoto(classroom.id);
    };

    const titleEl = this._overlay!.querySelector<HTMLElement>(".detail-title");

    titleEl?.addEventListener("click", refreshOnActivate, { signal: this._contentEvents.signal });
    // role="button" on a non-native element gets no automatic Enter/Space ->
    // click synthesis from the browser — without this, the refresh action is
    // unreachable by keyboard.
    titleEl?.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        refreshOnActivate();
      },
      { signal: this._contentEvents.signal },
    );
  }

  /**
   * FLIP-animates layout reflows on resize that CSS can't transition on its
   * own: the masonry cards, and the wrapping feature chips. Each
   * ResizeObserver tick measures where an item landed, then slides it from
   * where it visually was (including any in-flight slide) to its new spot.
   * Uses the Web Animations API so it never fights the elements' own
   * transform/translate/transition styles.
   */
  _animateReflow(container: HTMLElement | null, itemSelector: string, observers: ResizeObserver[]) {
    if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const items = [...container.querySelectorAll<HTMLElement>(itemSelector)];

    const measure = () =>
      new Map(
        items.map((el) => {
          const r = el.getBoundingClientRect();
          const m = new DOMMatrix(getComputedStyle(el).transform);

          return [el, { x: r.left - m.e, y: r.top - m.f, tx: m.e, ty: m.f }] as const;
        }),
      );

    let prev: ReturnType<typeof measure> | null = null;

    const ro = new ResizeObserver(() => {
      const cur = measure();

      if (prev) {
        for (const el of items) {
          const a = prev.get(el);
          const b = cur.get(el);

          if (!a || !b) continue;
          // Old visual spot = old layout spot + the slide still in flight now
          const dx = a.x + b.tx - b.x;
          const dy = a.y + b.ty - b.y;

          if (Math.abs(dx - b.tx) < 1 && Math.abs(dy - b.ty) < 1) continue;
          el.getAnimations()
            .filter((an) => an.id === "reflow")
            .forEach((an) => an.cancel());

          const anim = el.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
            { duration: 350, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          );

          anim.id = "reflow";
        }
      }

      prev = measure();
    });

    ro.observe(container);
    observers.push(ro);
  }

  _animateMasonry(content: HTMLElement | null) {
    this._reflowObservers.forEach((o) => o.disconnect());
    this._reflowObservers = [];

    if (!content) return;
    this._animateReflow(
      content,
      ":scope > .detail-column > .detail-section",
      this._reflowObservers,
    );
    this._animateReflow(
      content.querySelector<HTMLElement>(".detail-features"),
      ".detail-feature-chip",
      this._reflowObservers,
    );
  }

  // ---------- RENDER: HERO PHOTO ----------

  /**
   * Feeds the blurred backdrop behind the hero photo and derives the page tint,
   * dark-mode dimming and title tone from it. Always the thumbnail: under a
   * 40px blur its resolution is lost anyway, and the tint / dimming /
   * title-tone caches are keyed by this URL.
   */
  _setBackdrop(url: string) {
    // Pre-blurred when it can be (utils/photo.ts blurredBackdrop): the GPU
    // otherwise redoes the blur on every frame the page moves. That needs the
    // backdrop's box, measured once an earlier open has landed
    // (_measureBackdrop); until then, the live filter. ?vtdebug=liveblur keeps
    // the live one, to compare.
    const pre =
      this._backdropBox && !vtFlag("liveblur") ? blurredBackdrop(url, this._backdropBox) : null;

    this._photo.current?.setBackdrop(pre ?? url, !!pre);

    // Base color under the backdrop's fade (see #classroom-detail-overlay's
    // background). Best-effort: without it the page just stays --background-color.
    const cached = getCachedPhotoColor(url);

    if (cached) document.documentElement.style.setProperty("--detail-tint", cached);
    this._applyPhotoTone(url);

    void extractPhotoColor(url).then((color) => {
      if (!this._backdropEl()) return;

      if (color) document.documentElement.style.setProperty("--detail-tint", color);
      this._applyPhotoTone(url);
    });
  }

  _backdropEl() {
    return this._overlay?.querySelector<HTMLElement>(".detail-photo-backdrop") ?? null;
  }

  _applyPhotoTone(url: string) {
    if (!this._backdropEl()) return;
    this._applyPhotoDim(url);
    this._applyTitleTone(url);
  }

  /**
   * Brightness multiplier for the photo: 1 for dark/mid photos, down to 0.7 for
   * very bright ones. Dark mode only (1 in light mode). CSS applies it to the
   * photo and its backdrop together so the fade between them stays seamless.
   */
  _photoDim(url: string) {
    if (!window.matchMedia("(prefers-color-scheme: dark)").matches) return 1;
    const lum = getCachedPhotoAverageLuminance(url);

    if (lum == null) return 1;
    // Linear-light: mid-grey is ~0.18, a white-walled room ~0.5+.
    const k = Math.min(1, Math.max(0, (lum - 0.2) / 0.35));

    return 1 - 0.3 * k;
  }

  /** Publishes _photoDim as --photo-dim on the overlay (read by the dark-mode CSS). */
  _applyPhotoDim(url: string) {
    if (getCachedPhotoAverageLuminance(url) == null || !this._overlay) return;
    this._overlay.style.setProperty("--photo-dim", this._photoDim(url).toFixed(3));
  }

  /**
   * Picks black or white for the title from what's actually behind it: the
   * photo's bottom strip, faded into the theme background (the title sits in
   * that fade). Sets data-title-tone="light"|"dark" on the overlay, meaning
   * the backdrop is light/dark; CSS turns that into the text color.
   */
  _applyTitleTone(url: string) {
    const photoLum = getCachedPhotoLuminance(url);

    if (photoLum == null || !this._overlay) return;
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const bgLum = dark ? 0.02 : 0.9;
    // The photo is what's on screen after dark-mode dimming: CSS brightness()
    // scales sRGB values, which is roughly dim^2.2 in linear light.
    const shownLum = photoLum * this._photoDim(url) ** 2.2;
    const lum = shownLum * 0.8 + bgLum * 0.2;
    // 0.179 is where black and white text have equal WCAG contrast; sitting
    // higher gives white the benefit on mid-tones, where it reads better.
    this._overlay.dataset.titleTone = lum > 0.3 ? "light" : "dark";
  }

  /* Replaces the thumbnail the hero is showing with the full photo, once the
     transition has landed and the page has a moment: decoding and uploading a
     1500x1125 photo is exactly what an older phone can't do while the zoom or
     the page's entrance animations are running. Decoded off to the side first,
     so the <img> changes source with its pixels ready — no flash — and a full
     photo that fails to load just leaves the thumbnail where it is. */
  async _upgradePhoto(classroomId: number, img: HTMLImageElement | null) {
    if (!img) return;
    const full = await fetchPhotoUrl(classroomId);

    if (img.src === full) return;
    await new Promise<void>((resolve) => this._afterTransition(resolve));
    await new Promise<void>((resolve) => {
      if ("requestIdleCallback" in window) requestIdleCallback(() => resolve(), { timeout: 800 });
      else setTimeout(resolve, 300);
    });

    if (this._currentId !== classroomId || !img.isConnected || img.src === full) return;
    const pre = new Image();
    pre.src = full;

    try {
      await pre.decode();
    } catch {
      return;
    }

    if (this._currentId !== classroomId || !img.isConnected) return;
    img.src = full;
  }

  async _loadPhoto(classroomId: number) {
    if (this._currentId !== classroomId) return;
    const photo = this._photo.current;

    if (!photo) return;

    try {
      // The photo URLs are plain, stable routes (/v1/photos/:id and its /thumb).
      // Once one has been resolved for this room this session (an earlier open, a
      // card, a search row), its bytes are almost certainly in the HTTP cache. The
      // full photo if we have it, else the thumbnail, which _upgradePhoto replaces.
      const cachedUrl = photoUrlCache.get(classroomId) ?? thumbUrlCache.get(classroomId);
      photo.show();

      const shownImg =
        this._overlay?.querySelector<HTMLImageElement>(".detail-photo.loaded") ?? null;

      // Already revealed (by the ViewTransition, or an earlier call): at most the
      // thumbnail the zoom carried still has to make way for the full photo.
      if (shownImg) {
        void this._upgradePhoto(classroomId, shownImg);

        return;
      }

      if (cachedUrl) {
        photo.reveal(cachedUrl);
        this._setBackdrop(thumbUrl(classroomId));
        this._photoRevealed();
        void this._upgradePhoto(
          classroomId,
          this._overlay?.querySelector<HTMLImageElement>(".detail-photo") ?? null,
        );

        return;
      }

      // First time we've needed this room's photo this session — resolve, load,
      // decode, then reveal with the intro transition. The thumbnail first: a
      // third of the bytes over a phone's connection. The full photo follows.
      const url = await fetchThumbUrl(classroomId);

      if (this._currentId !== classroomId || this._photo.current !== photo) return;
      const img = photo.load(url);
      this._setBackdrop(url);

      if (!img) return;
      await img.decode();

      if (this._currentId === classroomId && this._photo.current === photo) {
        photo.reveal(url);
        this._photoRevealed();
        void this._upgradePhoto(classroomId, img);
      }
    } catch (err) {
      console.error("Classroom photo load error:", err);

      if (this._currentId === classroomId && this._photo.current === photo) {
        markPhotoBroken(classroomId);
        photo.hide();
      }
    }
  }

  // ---------- RENDER: WEEKLY SCHEDULE ----------

  /**
   * Renders the weekly schedule tab for a classroom: day picker, timeline
   * blocks, and the occupation popover, including auto-selecting and
   * highlighting a searched day/lesson when one was carried over.
   */
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
      // Rome's calendar date, not the browser's: the day keys these are
      // matched against (dayData.date) come from the API in Rome time.
      const today = getRomeNow();

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

      const nowMin = romeMinutesOfDay();

      const nowPct =
        nowMin >= DAY_START && nowMin <= DAY_END
          ? (((nowMin - DAY_START) / total) * 100).toFixed(2)
          : null;

      // Query context: from/to range carried over from the Available Tab
      const queryDateKey = this._queryContext?.date?.replace(/-/g, "") ?? null;
      const highlightDateKey = this._highlight?.date?.replace(/-/g, "") ?? null;

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

      const _dayParts = days.map(({ dayData, date }) => {
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
        let roomBuilding: Building | null = null;

        outer: for (const c of dayData.campuses ?? []) {
          for (const b of c.buildings ?? []) {
            const room = b.classrooms?.find((r) => String(r.id) === String(classroomId));

            if (room) {
              occupancy = room.occupancy ?? [];
              roomBuilding = b;
              break outer;
            }
          }
        }

        // The hours the building is shut, shown as their own "Closed" areas so
        // they don't read as bookings. The bar carries the open range too, for
        // the hover cursor. Unknown hours draw nothing.
        const opening = getBuildingOpening(roomBuilding, dayData.date);

        let openFrom = DAY_START,
          openTo = DAY_END;

        if (opening?.closed) {
          openFrom = openTo = DAY_START;
        } else if (opening) {
          openFrom = Math.max(timeToMinutes(opening.opens), DAY_START);
          openTo = Math.min(timeToMinutes(opening.closes), DAY_END);
        }

        const closedRanges =
          openFrom >= openTo
            ? [[DAY_START, DAY_END]]
            : [
                [DAY_START, openFrom],
                [openTo, DAY_END],
              ].filter(([s, e]) => e > s);

        const closedHtml = closedRanges.map(([s, e]) => {
          const left = (((s - DAY_START) / total) * 100).toFixed(2);
          const width = (((e - s) / total) * 100).toFixed(2);
          // Label only where there's room for it; the hatching still says it
          const label = (e - s) / total >= 0.15 ? <span>{t("detail.closed")}</span> : "";

          return (
            <div
              key={`closed-${s}`}
              className={"detail-schedule-closed"}
              role={"img"}
              aria-label={`${t("detail.closed")} ${minutesToTimeDisplay(s)}–${minutesToTimeDisplay(e)}`}
              style={cssVars({ "--block-start": left + "%", "--block-size": width + "%" })}
            >
              {label}
            </div>
          );
        });

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

          return (
            <>
              <div
                className={
                  "detail-schedule-block" +
                  (isPrimaryHighlight ? " detail-schedule-block--highlight" : "")
                }
                data-slot-idx={slotIdx}
                tabIndex={0}
                role={"button"}
                aria-label={`${occupationTimeRange(slot)} ${occupationTitle(slot)}`}
                style={cssVars({
                  "--block-start": left + "%",
                  "--block-size": width + "%",
                  "--idx": idx,
                })}
              ></div>
            </>
          );
        });

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
                  <div
                    className={"detail-schedule-bar"}
                    data-open-from={opening ? openFrom : undefined}
                    data-open-to={opening ? openTo : undefined}
                  >
                    {Children.toArray(closedHtml)}
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
        const n = romeMinutesOfDay();

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
          .querySelectorAll(".detail-schedule-block--highlight")
          .forEach((el) => el.classList.remove("detail-schedule-block--highlight"));
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
      const nowMins = romeMinutesOfDay();
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

      const relayoutMobile = () => {
        daySelector.refresh();
        selectScheduleDay(selectedDayIndex, { silent: true, animate: false });
        positionDetailTodayIndicator();
      };

      mobileQuery.addEventListener(
        "change",
        (e) => {
          if (e.matches) relayoutMobile();
          else positionDesktopTodayIndicator();
        },
        { signal: this._scheduleEvents.signal },
      );

      // The picker is centered in its wrapper, so resizing the window moves it
      // without necessarily changing its own size; the pill and Today badge are
      // placed with absolute offsets and would stay behind. Re-measure whenever
      // the wrapper or the picker changes size (also covers display:none → block).
      if ("ResizeObserver" in window) {
        let raf = 0;

        const ro = new ResizeObserver(() => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            if (pickerContainer!.offsetWidth) relayoutMobile();
          });
        });

        ro.observe(pickerContainer!);

        if (pickerContainer!.parentElement) ro.observe(pickerContainer!.parentElement);
        this._scheduleEvents.signal.addEventListener(
          "abort",
          () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
          },
          { once: true },
        );
      }

      // ---------- TIMELINE HOVER ----------
      // Coalesced to one update per frame: mousemove fires faster than the
      // display refreshes, and each sample used to read the bar's rect (a
      // forced layout, since the previous sample had just written styles) and
      // then flushSync a React render for the time label. Now the latest
      // sample is stored and applied once in the next animation frame, when
      // layout is already clean, and the label is plain text.
      const mobileVerticalMQ = window.matchMedia("(max-width: 599px)");
      let _activeBar: HTMLElement | null = null;
      let hoverFrame = 0;
      let hoverBar: HTMLElement | null = null;
      let hoverX = 0;
      let hoverY = 0;

      const hideHover = (bar: HTMLElement) => {
        const prevCursor = bar
          .closest<HTMLElement>(".detail-schedule-bar-wrapper")
          ?.querySelector<HTMLElement>(".timeline-hover-cursor");

        if (prevCursor) prevCursor.hidden = true;
        const prevLine = bar.querySelector<HTMLElement>(".timeline-hover-line");

        if (prevLine) prevLine.hidden = true;
      };

      const applyHover = () => {
        hoverFrame = 0;
        const bar = hoverBar;

        if (_activeBar && _activeBar !== bar) {
          hideHover(_activeBar);
          _activeBar = null;
        }

        if (!bar) return;
        _activeBar = bar;

        const wrapper = bar.closest<HTMLElement>(".detail-schedule-bar-wrapper");
        const cursor = wrapper?.querySelector<HTMLElement>(".timeline-hover-cursor");
        const line = bar.querySelector<HTMLElement>(".timeline-hover-line");

        if (!cursor || !line) return;

        const rect = bar.getBoundingClientRect();
        const isMobileVertical = mobileVerticalMQ.matches;

        const fraction = isMobileVertical
          ? Math.max(0, Math.min(1, (hoverY - rect.top) / rect.height))
          : Math.max(0, Math.min(1, (hoverX - rect.left) / rect.width));

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

        const label = minutesToTimeDisplay(minutes);

        if (cursor.textContent !== label) cursor.textContent = label;
        cursor.hidden = false;
        line.hidden = false;
      };

      this._scheduleEvents.signal.addEventListener("abort", () => {
        if (hoverFrame) cancelAnimationFrame(hoverFrame);
        hoverFrame = 0;
      });

      container.addEventListener(
        "mousemove",
        (e) => {
          hoverBar =
            e.target instanceof Element
              ? e.target.closest<HTMLElement>(".detail-schedule-bar")
              : null;
          hoverX = e.clientX;
          hoverY = e.clientY;

          if (!hoverFrame) hoverFrame = requestAnimationFrame(applyHover);
        },
        { signal: this._scheduleEvents.signal, passive: true },
      );
      container.addEventListener(
        "mouseleave",
        () => {
          hoverBar = null;

          if (hoverFrame) {
            cancelAnimationFrame(hoverFrame);
            hoverFrame = 0;
          }

          if (_activeBar) {
            hideHover(_activeBar);
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
      // Suppresses the close-on-scroll handler below while the auto-scroll
      // to a searched lesson is still animating, so it doesn't dismiss the
      // popover it just opened.
      let _autoScrolling = false;

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

        const scheduleSignal = this._scheduleEvents.signal;

        // Waits for the open transition: it holds the page at the top until it
        // lands (see _pinScroll), which would cancel this scroll outright.
        this._afterTransition(() => {
          if (!primaryBlock?.isConnected || scheduleSignal.aborted) return;
          const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

          showOccupationPopover(primaryBlock);
          // Keyboard/screen-reader users land on the searched lesson itself, so
          // its aria-label gets read out, instead of on a page with no clue
          // which block was the match. Scrolling is handled just below.
          primaryBlock.focus({ preventScroll: true });

          if (reduceMotion) {
            primaryBlock.scrollIntoView({ block: "center", behavior: "auto" });
          } else {
            const stopAutoScroll = () => {
              _autoScrolling = false;
            };

            _autoScrolling = true;
            primaryBlock.scrollIntoView({ block: "center", behavior: "smooth" });
            window.addEventListener("scrollend", stopAutoScroll, {
              once: true,
              signal: scheduleSignal,
            });
            // scrollend never fires if the block was already in view (no scroll
            // happens at all), which would leave the flag stuck and disable
            // close-on-scroll for the rest of this render.
            setTimeout(stopAutoScroll, 1000);
          }
        });
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

        // Keyboard activation for the blocks, which are role="button" divs and
        // so get no native Enter/Space handling. Deliberately *not* a toggle
        // like the click handler above: focusin already shows the popover for
        // the focused block, so toggling would fight it (that interference is
        // also why the first click on an unfocused block opens and then
        // immediately closes it). Enter/Space re-show idempotently and Escape
        // dismisses, which is the behaviour a keyboard user expects anyway.
        // preventDefault matters on its own: without it Space scrolls the page.
        container.addEventListener(
          "keydown",
          (e) => {
            if (e.key !== "Enter" && e.key !== " " && e.key !== "Escape") return;

            const block =
              e.target instanceof Element
                ? e.target.closest<HTMLElement>(".detail-schedule-block")
                : null;

            if (!block) return;
            e.preventDefault();
            e.stopPropagation();

            if (e.key === "Escape") hideOccupationPopover();
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
        const onScroll = () => {
          if (_autoScrolling) return;
          hideOccupationPopover();
        };

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
