// Search overlay — the bottom-nav search FAB opens this as a sheet over
// whatever tab is currently showing, rather than switching to its own tab
// page. It owns the presentation/UX AND (unlike most of this app's other
// views) the results DOM itself: the results list is built and diffed by
// this module directly rather than by React, because search-overlay-motion.ts's
// FLIP-style morph needs to read and animate the live on-screen DOM between
// renders, which can't coexist with React's own reconciliation of the same
// nodes — the same reasoning the app already applies to the Mapbox instance
// in campus-map.tsx and the pill-drag engine in settings.tsx. React (see
// search-overlay.tsx) renders only the static shell once: the panel, the
// search bar and an empty results container this module mounts into.
//
// Mobile layout is classic Spotlight: the bar sits at a fixed top offset (the
// header's old slot, which fades out) and results grow downward beneath it.
// The keyboard only ever clips the results' available height — see the
// visualViewport tracking below and the panel rule in search-overlay.css.
//
// RESULTS: a single Top Hit (the best-scoring item across every type), then
// Classrooms / Buildings / Professors / Exams / Lessons sections, each an
// iOS-style inset-grouped list capped to 4 rows with a "Show all" expander.
// Exam/lesson rows expand in place (single-open accordion, animated) to list
// every session; classroom rows open the classroom detail page; building rows
// jump to the Campus tab; professor rows swap the results panel for an
// in-place professor view (openProfessorView/exitProfessorView below) that
// slides in from the right and back.
//
// MOTION: every change to the results is animated. A new query's results are
// diffed against the ones on screen by search-overlay-motion.ts (rows and
// sections grow in, collapse out and glide to their new places, all off one
// interruptible spring); the results box itself materialises under the bar
// and dissolves back when the field is cleared (setResultsBox); and the
// professor view slides on a spring that can be turned around mid-flight
// (startSlide).

import { t, getLocale, onLanguageSwitch } from "../i18n";
import { escapeHtml, highlight } from "../utils/html";
import { createTimeFormatter } from "../utils/time-format";
import { fetchThumbUrl, thumbUrlCache, markPhotoBroken, isPhotoBroken } from "../utils/photo";
import {
  runSearch,
  getProfessorSchedule,
  hasOccupationData,
  type SearchItem,
  type ClassroomSearchItem,
  type BuildingSearchItem,
  type ProfessorSearchItem,
  type OccupationSearchItem,
  type OccupationSession,
  type ProfessorSchedule,
} from "../classroom-search-data";
import { classroomsData as occupancyDays } from "../available-rooms-script";
import type { ClassroomStatus } from "../types";
import { activateGroupTab } from "./bottom-nav";
import { goToBuilding } from "./campus-buildings";
import { morphInto, settleMorph, isSettled, fadeIn, ClockedSpring } from "./search-overlay-motion";
import { createBackButton, createSegmentedControl } from "vitrium";

const DEBOUNCE_MS = 200;

const SECTION_CAP = 4;

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

// For a caller that runs its own view transition (classroom detail): call it
// inside that transition's update callback, so the overlay leaves as part of
// the same transition rather than racing it with one of its own.
export function dismissSearchOverlayInstant() {
  dismissInstant();
}

const STATUS_KEYS: Record<ClassroomStatus, string> = {
  free: "status.free",
  "partially-free": "status.partiallyFree",
  occupied: "status.occupied",
  "free-soon": "status.freeSoon",
  "occupied-soon": "status.occupiedSoon",
  closed: "status.closed",
};

// The icon/key for the Top Hit classroom's feature row, mirroring
// classroom-detail.tsx's feature icon list.
const FEATURE_ICONS = new Map<number, { icon: string; key: string }>([
  [4, { icon: "hgi-projector-01", key: "features.videoProjector" }],
  [5, { icon: "hgi-mic-01", key: "features.radioMic" }],
  [6, { icon: "hgi-blinds", key: "features.dimmable" }],
  [7, { icon: "hgi-cable", key: "features.wiredDesk" }],
  [142, { icon: "hgi-plug-socket", key: "features.powerOutlets" }],
  [223, { icon: "hgi-computer-video-call", key: "features.videoconf" }],
]);

interface DayTimeCtx {
  dateFmt: Intl.DateTimeFormat;
  timeFmt: Intl.DateTimeFormat;
}

interface RowContext extends DayTimeCtx {
  q: string;
  corrections: string[];
  large: boolean;
}

/* ── Section registry: fixed order, skipped when empty ─────────────────── */

interface Section {
  key: "classrooms" | "buildings" | "professors" | "exams" | "lessons";
  type: SearchItem["type"];
  labelKey: string;
  icon: string;
  spaced?: boolean;
  build: (item: never, ctx: RowContext) => HTMLElement;
}

// SAFETY: each row's `build` only ever receives an item of the `type` on
// that same row — buildResultsPane looks up items by `sec.key`, whose
// SearchResult field always holds that type — so the cast to the table's
// widened `Section["build"]` signature is sound by construction here.
const SECTIONS: Section[] = [
  {
    key: "classrooms",
    type: "classroom",
    labelKey: "search.sectionClassrooms",
    icon: "hgi-university",
    spaced: true,
    build: buildClassroomRow as Section["build"],
  },
  {
    key: "buildings",
    type: "building",
    labelKey: "search.sectionBuildings",
    icon: "hgi-building-06",
    build: buildBuildingRow as Section["build"],
  },
  {
    key: "professors",
    type: "professor",
    labelKey: "search.sectionProfessors",
    icon: "hgi-user",
    build: buildProfessorRow as Section["build"],
  },
  {
    key: "exams",
    type: "exam",
    labelKey: "search.sectionExams",
    icon: "hgi-mortarboard-02",
    spaced: true,
    build: buildExamRow as Section["build"],
  },
  {
    key: "lessons",
    type: "lesson",
    labelKey: "search.sectionLessons",
    icon: "hgi-book-02",
    spaced: true,
    build: buildLessonRow as Section["build"],
  },
];

/* ── Small building blocks ──────────────────────────────────────────────── */

function sectionLabel(text: string, icon: string) {
  const el = document.createElement("div");

  el.className = "search-section-label";
  el.innerHTML = `<i class="hgi-stroke ${icon} search-section-label-icon" aria-hidden="true"></i><span>${escapeHtml(text)}</span>`;

  return el;
}

function tooManyNotice(n: number) {
  const p = document.createElement("p");

  p.className = "search-too-many-notice";
  p.textContent = t("search.tooManyResults").replace("{n}", String(n));

  return p;
}

function fmtTime(hhmm: string, timeFmt: Intl.DateTimeFormat) {
  const [h, m] = String(hhmm).split(":").map(Number);

  if (!Number.isFinite(h) || !Number.isFinite(m)) return String(hhmm ?? "");

  return timeFmt.format(new Date(2000, 0, 1, h, m));
}

// "Today"/"Tomorrow" where natural, weekday+date otherwise.
function fmtDay(iso: string, dateFmt: Intl.DateTimeFormat) {
  const d = new Date(`${iso}T00:00`);

  if (Number.isNaN(d.getTime())) return String(iso ?? "");
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);

  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfDayAfter = new Date(startOfTomorrow);

  startOfDayAfter.setDate(startOfDayAfter.getDate() + 1);

  if (d >= startOfToday && d < startOfTomorrow) return t("search.today");

  if (d >= startOfTomorrow && d < startOfDayAfter) return t("search.tomorrow");

  return dateFmt.format(d);
}

function fmtWhen(session: OccupationSession, ctx: DayTimeCtx) {
  return `${fmtDay(session.date, ctx.dateFmt)} · ${fmtTime(session.inizio, ctx.timeFmt)}–${fmtTime(session.fine, ctx.timeFmt)}`;
}

// Photos load lazily (rows scroll past quickly in a long results list), same
// IntersectionObserver + cache pattern as classroom-card.tsx.
const rowPhotoObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      rowPhotoObserver.unobserve(entry.target);
      // SAFETY: this observer only ever observes elements built by
      // buildPhotoLead below, always a <div>.
      const el = entry.target as HTMLElement;
      const roomId = Number(el.dataset.photoFor);
      const img = el.querySelector<HTMLImageElement>("img")!;

      void fetchThumbUrl(roomId).then((url) => {
        img.onerror = () => {
          markPhotoBroken(roomId);
          el.classList.add("photo-failed");
        };

        img.src = url;
        img
          .decode()
          .then(() => img.classList.add("loaded"))
          .catch(() => el.classList.add("photo-failed"));
      });
    }
  },
  { rootMargin: "200px" },
);

function buildPhotoLead(room: ClassroomSearchItem["room"], large: boolean) {
  const lead = document.createElement("div");

  lead.className = "search-row-lead" + (large ? " search-row-lead--lg" : "");

  if (room.idfoto && !isPhotoBroken(room.id)) {
    lead.classList.add("search-row-lead--photo");
    lead.dataset.photoFor = String(room.id);
    const cachedUrl = thumbUrlCache.get(room.id);

    lead.innerHTML = `<img class="search-row-photo${cachedUrl ? " loaded" : ""}" alt=""${cachedUrl ? ` src="${escapeHtml(cachedUrl)}"` : ""}>`;

    if (cachedUrl)
      lead.querySelector("img")!.addEventListener("error", () => {
        markPhotoBroken(room.id);
        lead.classList.add("photo-failed");
      });
    else rowPhotoObserver.observe(lead);
  } else {
    lead.classList.add("search-row-lead--icon");
    lead.innerHTML = `<i class="hgi-stroke hgi-door-01" aria-hidden="true"></i>`;
  }

  return lead;
}

function buildIconTile(iconClass: string, large: boolean, accent: boolean) {
  const lead = document.createElement("div");

  lead.className =
    "search-row-lead search-row-lead--tile" +
    (accent ? " search-row-lead--accent" : "") +
    (large ? " search-row-lead--lg" : "");
  lead.innerHTML = `<i class="hgi-stroke ${iconClass}" aria-hidden="true"></i>`;

  return lead;
}

// Deterministic hue from the professor key so the same person always gets the
// same avatar colour; mixed against the theme surface so it reads well light
// and dark (see .search-avatar in search-overlay.css).
function hueFromKey(key: string) {
  let h = 0;

  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;

  return h % 360;
}

function buildAvatarLead(initials: string, key: string, large: boolean) {
  const lead = document.createElement("div");

  lead.className =
    "search-row-lead search-row-lead--avatar search-avatar" + (large ? " search-row-lead--lg" : "");
  lead.style.setProperty("--avatar-hue", String(hueFromKey(key)));
  lead.textContent = initials;

  return lead;
}

/* ── Row builders — one per result type. Each takes (item, ctx) and returns
   a DOM node ready to drop into a section list or the Top Hit slot. Every row
   that's independently selectable/activatable carries data-row (keyboard nav
   walks these in DOM order — see refreshActionable). ── */

function buildClassroomRow(item: ClassroomSearchItem, ctx: RowContext) {
  const { room, buildingName, buildingAltName, campusName, status } = item;
  const row = document.createElement("button");

  row.type = "button";
  row.className = "search-row search-row--classroom" + (ctx.large ? " search-row--tophit" : "");
  row.dataset.row = "";
  row.dataset.openClassroom = String(room.id);
  row.tabIndex = -1;

  row.appendChild(buildPhotoLead(room, ctx.large));

  const body = document.createElement("div");

  body.className = "search-row-body";

  const buildingLine = [
    buildingAltName ? `${buildingName} · ${buildingAltName}` : buildingName,
    campusName,
  ]
    .filter(Boolean)
    .join(" · ");

  let metaHtml = "";

  if (ctx.large) {
    const bits: string[] = [];

    if (room.seats != null) {
      bits.push(
        `<span class="search-row-feature"><i class="hgi-stroke hgi-user-circle" aria-hidden="true"></i>${escapeHtml(String(room.seats))}</span>`,
      );
    }

    for (const f of room.features ?? []) {
      const icon = FEATURE_ICONS.get(f.id);

      if (!icon) continue;
      bits.push(
        `<span class="search-row-feature" title="${escapeHtml(t(icon.key))}"><i class="hgi-stroke ${icon.icon}" aria-hidden="true"></i></span>`,
      );

      if (bits.length >= 5) break; // 1 seat count + up to 4 feature icons
    }

    if (bits.length)
      metaHtml = `<div class="search-row-extra search-row-features">${bits.join("")}</div>`;
  }

  body.innerHTML = `
    <div class="search-row-title"><span class="search-row-title-text">${highlight(room.name, ctx.q, ctx.corrections)}</span></div>
    <div class="search-row-subtitle">${highlight(buildingLine, ctx.q, ctx.corrections)}</div>
    ${metaHtml}
  `;
  row.appendChild(body);

  const statusKey = status ? STATUS_KEYS[status] : null;

  if (statusKey) {
    const pill = document.createElement("span");

    pill.className = `search-row-trailing classroom-status-txt ${status}`;
    pill.textContent = t(statusKey);
    row.appendChild(pill);
  }

  return row;
}

function buildBuildingRow(item: BuildingSearchItem, ctx: RowContext) {
  const { campusId, campusName, name, altName, roomCount, freeNow } = item;
  const row = document.createElement("button");

  row.type = "button";
  row.className = "search-row search-row--building" + (ctx.large ? " search-row--tophit" : "");
  row.dataset.row = "";
  row.tabIndex = -1;

  row.appendChild(buildIconTile("hgi-university", ctx.large, false));

  const body = document.createElement("div");

  body.className = "search-row-body";
  const subtitleParts = [campusName, t("search.roomsCount").replace("{n}", String(roomCount))];

  if (freeNow != null) subtitleParts.push(t("search.freeNowCount").replace("{n}", String(freeNow)));
  body.innerHTML = `
    <div class="search-row-title"><span class="search-row-title-text">${highlight(name, ctx.q, ctx.corrections)}</span>${altName ? `<span class="search-row-title-alt">${highlight(altName, ctx.q, ctx.corrections)}</span>` : ""}</div>
    <div class="search-row-subtitle">${escapeHtml(subtitleParts.join(" · "))}</div>
  `;
  row.appendChild(body);
  row.innerHTML += `<span class="search-row-trailing search-row-chevron"><i class="hgi-stroke hgi-arrow-right-01" aria-hidden="true"></i></span>`;

  row.addEventListener("click", () => {
    // No own close transition — the Campus tab teleport is the navigation.
    dismissInstant();
    activateGroupTab("search-classrooms-container");
    goToBuilding(campusId, name);
  });

  return row;
}

function buildProfessorRow(item: ProfessorSearchItem, ctx: RowContext) {
  const { key, name, initials, sessionCount, examCount, next } = item;
  const row = document.createElement("button");

  row.type = "button";
  row.className = "search-row search-row--professor" + (ctx.large ? " search-row--tophit" : "");
  row.dataset.row = "";
  row.dataset.professorKey = key;
  row.tabIndex = -1;

  row.appendChild(buildAvatarLead(initials, key, ctx.large));

  const body = document.createElement("div");

  body.className = "search-row-body";
  const parts = [t("search.lessonsCount").replace("{n}", String(sessionCount))];

  if (examCount > 0) parts.push(t("search.examsCount").replace("{n}", String(examCount)));
  let subtitle = parts.join(" · ");

  subtitle +=
    " · " +
    (next
      ? `${t("search.next")}: ${fmtDay(next.date, ctx.dateFmt)} ${fmtTime(next.inizio, ctx.timeFmt)}, ${next.roomName}`
      : t("search.noUpcoming"));
  body.innerHTML = `
    <div class="search-row-title"><span class="search-row-title-text">${highlight(name, ctx.q, ctx.corrections)}</span></div>
    <div class="search-row-subtitle">${escapeHtml(subtitle)}</div>
  `;
  row.appendChild(body);
  row.innerHTML += `<span class="search-row-trailing search-row-chevron"><i class="hgi-stroke hgi-arrow-right-01" aria-hidden="true"></i></span>`;

  // stopPropagation: openProfessorView swaps resultsEl's content in place (via
  // a slide transition); without this the overlay's own backdrop-dismiss
  // listener (which checks panel.contains(e.target) once the click bubbles
  // up) can see a target mid-move and close the whole overlay.
  row.addEventListener("click", (e) => {
    e.stopPropagation();
    openProfessorView(key);
  });

  return row;
}

function itemKey(item: OccupationSearchItem) {
  return [item.type, item.code, item.title, item.section, item.professors.join(",")].join("|");
}

function buildSessionRow(s: OccupationSession, ctx: DayTimeCtx) {
  const past = new Date(`${s.date}T${s.fine}:00`).getTime() < Date.now();
  const b = document.createElement("button");

  b.type = "button";
  b.className = "search-session-row" + (past ? " search-session-row--past" : "");
  b.dataset.openClassroom = String(s.roomId);
  // Reuses the existing classroom-detail "query context" highlight/day-select
  // mechanism (the same attributes ClassroomCard sets for an available-tab
  // search result) rather than a bespoke pulse mechanism, since the detail
  // page already implements that path end to end. queryDate/From/To pick the
  // right day; highlightDate/From/To (separate — see classroom-detail.tsx's
  // `_highlight`) are what actually scroll to and pop the matched slot open.
  b.dataset.queryDate = s.date;
  b.dataset.queryFrom = s.inizio;
  b.dataset.queryTo = s.fine;
  b.dataset.highlightDate = s.date;
  b.dataset.highlightFrom = s.inizio;
  b.dataset.highlightTo = s.fine;
  b.tabIndex = -1;
  b.innerHTML =
    `<span class="search-session-body">` +
    `<span class="search-session-when">${escapeHtml(fmtWhen(s, ctx))}</span>` +
    `<span class="search-session-where">${escapeHtml(s.roomName)} · ${escapeHtml(s.buildingAltName || s.buildingName)}</span>` +
    `</span>` +
    `<span class="search-session-arrow"><i class="hgi-stroke hgi-arrow-right-01" aria-hidden="true"></i></span>`;

  return b;
}

// A session row for the professor view: several different courses share one
// day list, so (unlike the accordion's buildSessionRow) each row also carries
// its own course title, an exam badge/tint, and a "Now" marker.
function buildProfessorSessionRow(s: OccupationSession, ctx: DayTimeCtx) {
  const now = Date.now();
  const startTs = new Date(`${s.date}T${s.inizio}:00`).getTime();
  const endTs = new Date(`${s.date}T${s.fine}:00`).getTime();
  const past = endTs < now;
  const isNow = startTs <= now && now < endTs;
  const b = document.createElement("button");

  b.type = "button";
  b.className =
    "search-session-row search-session-row--pv" +
    (past ? " search-session-row--past" : "") +
    (s.isExam ? " search-session-row--exam" : "");
  b.dataset.row = "";
  b.dataset.openClassroom = String(s.roomId);
  b.dataset.queryDate = s.date;
  b.dataset.queryFrom = s.inizio;
  b.dataset.queryTo = s.fine;
  b.dataset.highlightDate = s.date;
  b.dataset.highlightFrom = s.inizio;
  b.dataset.highlightTo = s.fine;
  b.tabIndex = -1;
  const titleText = s.title || t("detail.occupied");

  b.innerHTML =
    `<span class="search-session-body">` +
    `<span class="search-session-when">${escapeHtml(fmtTime(s.inizio, ctx.timeFmt))}–${escapeHtml(fmtTime(s.fine, ctx.timeFmt))}` +
    (isNow ? `<span class="search-session-now">${escapeHtml(t("search.now"))}</span>` : "") +
    `</span>` +
    `<span class="search-session-title-line">` +
    `<span class="search-session-course">${escapeHtml(titleText)}</span>` +
    (s.isExam
      ? `<span class="timeline-popover-badge search-row-badge">${escapeHtml(t("detail.examLabel"))}</span>`
      : "") +
    `</span>` +
    `<span class="search-session-where">${escapeHtml(s.roomName)} · ${escapeHtml(s.buildingAltName || s.buildingName)}</span>` +
    `</span>` +
    `<span class="search-session-arrow"><i class="hgi-stroke hgi-arrow-right-01" aria-hidden="true"></i></span>`;

  return b;
}

// Shared shape for exam/lesson: a header row (title/subtitle/tile) that
// expands in place into every session on tap. Returns a wrapper <div>. The
// session list always exists in the DOM (collapsed via a grid-template-rows
// 0fr→1fr animation) rather than being built/torn down on toggle, so the
// whole app only ever has one expanded item at a time and toggling it never
// re-renders the rest of the list — see toggleExpandedItem/setItemExpanded.
function buildExpandableRow(
  headerRow: HTMLButtonElement,
  item: OccupationSearchItem,
  ctx: RowContext,
) {
  const key = itemKey(item);
  const wrap = document.createElement("div");

  wrap.className = "search-item";
  const expanded = expandedItemKey === key;

  headerRow.dataset.itemKey = key;
  headerRow.setAttribute("aria-expanded", expanded ? "true" : "false");
  headerRow.classList.toggle("search-row--expanded", expanded);
  wrap.appendChild(headerRow);

  const collapse = document.createElement("div");

  collapse.className = "search-collapse" + (expanded ? " search-collapse--open" : "");
  const inner = document.createElement("div");

  inner.className = "search-collapse-inner";
  const list = document.createElement("div");

  list.className = "search-session-list";

  for (const s of item.sessions) {
    const row = buildSessionRow(s, ctx);

    // Collapsed session rows must not be reachable by the desktop ↑/↓ nav —
    // data-row is only present while this item is the expanded one.
    if (expanded) row.dataset.row = "";
    list.appendChild(row);
  }

  inner.appendChild(list);
  collapse.appendChild(inner);
  wrap.appendChild(collapse);

  headerRow.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleExpandedItem(key);
  });

  return wrap;
}

let expandedItemKey: string | null = null;

function toggleExpandedItem(key: string) {
  const opening = expandedItemKey !== key;
  const prevKey = expandedItemKey;

  expandedItemKey = opening ? key : null;

  if (prevKey && prevKey !== key) setItemExpanded(prevKey, false);
  setItemExpanded(key, opening);
  refreshActionable();
}

// Mutates one already-rendered exam/lesson item's DOM in place (no rebuild of
// the rest of the list) so the grid-template-rows transition on .search-collapse
// actually has something to animate from/to.
function setItemExpanded(key: string, expanded: boolean) {
  const headerRow = resultsEl.querySelector<HTMLElement>(`[data-item-key="${CSS.escape(key)}"]`);

  if (!headerRow) return;
  const wrap = headerRow.closest(".search-item");
  const collapse = wrap?.querySelector(".search-collapse");

  if (!collapse) return;
  headerRow.setAttribute("aria-expanded", expanded ? "true" : "false");
  headerRow.classList.toggle("search-row--expanded", expanded);
  collapse.classList.toggle("search-collapse--open", expanded);
  collapse
    .querySelectorAll<HTMLElement>(".search-session-row[data-row]")
    .forEach((el) => el.removeAttribute("data-row"));

  if (expanded) {
    collapse.querySelectorAll<HTMLElement>(".search-session-row").forEach((el) => {
      el.dataset.row = "";
    });
  }
}

function buildExamRow(item: OccupationSearchItem, ctx: RowContext) {
  const row = document.createElement("button");

  row.type = "button";
  row.className = "search-row search-row--exam" + (ctx.large ? " search-row--tophit" : "");
  row.dataset.row = "";
  row.tabIndex = -1;

  row.appendChild(buildIconTile("hgi-mortarboard-02", ctx.large, true));

  const body = document.createElement("div");

  body.className = "search-row-body";

  const next =
    item.sessions.find((s) => new Date(`${s.date}T${s.fine}:00`).getTime() > Date.now()) ??
    item.sessions[0];

  const more = item.sessionCount - 1;

  body.innerHTML = `
    <div class="search-row-title"><span class="search-row-title-text">${highlight(item.title || t("detail.occupied"), ctx.q, ctx.corrections)}</span><span class="timeline-popover-badge search-row-badge">${t("detail.examLabel")}</span></div>
    <div class="search-row-subtitle">${escapeHtml(fmtWhen(next, ctx))}${more > 0 ? " · " + escapeHtml(t("search.moreSessions").replace("{n}", String(more))) : ""}</div>
  `;
  row.appendChild(body);
  row.innerHTML += `<span class="search-row-trailing search-row-chevron"><i class="hgi-stroke hgi-chevron-down" aria-hidden="true"></i></span>`;

  return buildExpandableRow(row, item, ctx);
}

function buildLessonRow(item: OccupationSearchItem, ctx: RowContext) {
  const row = document.createElement("button");

  row.type = "button";
  row.className = "search-row search-row--lesson" + (ctx.large ? " search-row--tophit" : "");
  row.dataset.row = "";
  row.tabIndex = -1;

  row.appendChild(buildIconTile("hgi-book-02", ctx.large, false));

  const body = document.createElement("div");

  body.className = "search-row-body";

  const meta = [
    item.code != null ? String(item.code).padStart(6, "0") : null,
    item.professors.join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  const next =
    item.sessions.find((s) => new Date(`${s.date}T${s.fine}:00`).getTime() > Date.now()) ??
    item.sessions[0];

  const more = item.sessionCount - 1;

  body.innerHTML = `
    <div class="search-row-title"><span class="search-row-title-text">${highlight(item.title || t("detail.occupied"), ctx.q, ctx.corrections)}</span></div>
    <div class="search-row-subtitle">${highlight(meta, ctx.q, ctx.corrections)}</div>
    <div class="search-row-extra">${escapeHtml(fmtWhen(next, ctx))}${more > 0 ? " · " + escapeHtml(t("search.moreSessions").replace("{n}", String(more))) : ""}</div>
  `;
  row.appendChild(body);
  row.innerHTML += `<span class="search-row-trailing search-row-chevron"><i class="hgi-stroke hgi-chevron-down" aria-hidden="true"></i></span>`;

  return buildExpandableRow(row, item, ctx);
}

// SAFETY: renderResults below always looks this table up by `topHit.type`
// and calls it with that same `topHit`, so each entry only ever receives an
// item of its own row's type — the same by-construction guarantee as SECTIONS.
const TOP_HIT_BUILD: Record<SearchItem["type"], (item: never, ctx: RowContext) => HTMLElement> = {
  classroom: buildClassroomRow as never,
  building: buildBuildingRow as never,
  professor: buildProfessorRow as never,
  exam: buildExamRow as never,
  lesson: buildLessonRow as never,
};

/* ── Professor view ──────────────────────────────────────────────────────
   Swaps resultsEl's content for one professor's schedule, grouped by day.
   Data comes straight from getProfessorSchedule(key) — dynamic, so it's
   rebuilt on open, on occupancy arriving late (refreshActiveView), and on
   language switch. ── */

function professorViewCtx() {
  return {
    dateFmt: new Intl.DateTimeFormat(getLocale(), {
      weekday: "short",
      day: "numeric",
      month: "short",
    }),
    timeFmt: createTimeFormatter(),
  };
}

function buildProfessorPane(container: HTMLElement, key: string) {
  const ctx = professorViewCtx();
  const schedule = getProfessorSchedule(key);

  const header = document.createElement("div");

  header.className = "search-pv-header";

  const identity = document.createElement("div");

  identity.className = "search-pv-identity";
  identity.appendChild(buildAvatarLead(schedule ? schedule.initials : "?", key, true));
  const nameWrap = document.createElement("div");

  nameWrap.className = "search-pv-name-wrap";
  const nameEl = document.createElement("div");

  nameEl.className = "search-pv-name";
  nameEl.textContent = schedule ? schedule.name : "";
  nameWrap.appendChild(nameEl);

  if (schedule) {
    const countsEl = document.createElement("div");

    countsEl.className = "search-pv-counts";
    const lessonCount = Math.max(0, schedule.sessionCount - schedule.examCount);
    const parts = [t("search.lessonsCount").replace("{n}", String(lessonCount))];

    if (schedule.examCount > 0)
      parts.push(t("search.examsCount").replace("{n}", String(schedule.examCount)));
    countsEl.textContent = parts.join(" · ");
    nameWrap.appendChild(countsEl);
  }

  identity.appendChild(nameWrap);
  header.appendChild(identity);
  container.appendChild(header);

  if (!schedule) {
    const empty = document.createElement("div");

    empty.className = "search-pv-empty";
    empty.innerHTML = `
      <i class="hgi-stroke hgi-calendar-remove-01" aria-hidden="true"></i>
      <p>${escapeHtml(t("search.professorEmpty"))}</p>
    `;
    container.appendChild(empty);

    return;
  }

  const meta = document.createElement("div");

  meta.className = "search-pv-meta";
  const lessonCount = schedule.sessionCount - schedule.examCount;
  let filter: "all" | "lessons" | "exams" = "all";
  const body = document.createElement("div");

  body.className = "search-pv-body";

  // Lessons and exams both on the schedule: a Vitrium segmented control
  // narrows it to one kind. The days re-render through the motion engine, so
  // the sessions leaving collapse out and the rest close up, like the results.
  if (schedule.examCount > 0 && lessonCount > 0) {
    const seg = document.createElement("div");

    seg.className = "search-pv-filter";
    createSegmentedControl(seg, {
      items: [
        { value: "all", label: t("search.filterAll") },
        { value: "lessons", label: t("search.sectionLessons") },
        { value: "exams", label: t("search.sectionExams") },
      ],
      value: filter,
      onSelect(v, info) {
        if (info?.silent || v === filter) return;
        // SAFETY: the segmented control above is built with exactly these
        // three `value`s, so `v` is always one of them.
        filter = v as typeof filter;
        morphInto(body, buildProfessorDays(schedule, filter, ctx), { scroller: resultsEl });
        refreshActionable();
      },
    });
    meta.appendChild(seg);
  }

  if (schedule.courses.length) {
    const chips = document.createElement("div");

    chips.className = "search-pv-courses";
    const CHIP_CAP = 6;

    for (const course of schedule.courses.slice(0, CHIP_CAP)) {
      const chip = document.createElement("span");

      chip.className = "search-pv-course-chip";
      chip.textContent = course;
      chips.appendChild(chip);
    }

    if (schedule.courses.length > CHIP_CAP) {
      const more = document.createElement("span");

      more.className = "search-pv-course-chip search-pv-course-chip--more";
      more.textContent = t("search.moreCourses").replace(
        "{n}",
        String(schedule.courses.length - CHIP_CAP),
      );
      chips.appendChild(more);
    }

    meta.appendChild(chips);
  }

  const note = document.createElement("div");

  note.className = "search-pv-range-note";
  note.textContent = t("search.professorDaysNote").replace("{n}", String(occupancyDays.length));
  meta.appendChild(note);
  header.appendChild(meta);

  body.appendChild(buildProfessorDays(schedule, filter, ctx));
  container.appendChild(body);
}

// The schedule, grouped by day, keyed for the motion engine (the filter
// animates whole days in and out), each titled like a results section.
function buildProfessorDays(
  schedule: ProfessorSchedule,
  filter: "all" | "lessons" | "exams",
  ctx: DayTimeCtx,
) {
  const days = keyed(document.createElement("div"), "days");

  days.className = "search-pv-days";

  for (const day of schedule.days) {
    const sessions = day.sessions.filter(
      (s) => filter === "all" || (filter === "exams") === s.isExam,
    );

    if (!sessions.length) continue;
    const dayEl = keyed(document.createElement("div"), `day:${day.date}`);

    dayEl.className = "search-pv-day";
    dayEl.appendChild(sectionLabel(fmtDay(day.date, ctx.dateFmt), "hgi-calendar-03"));
    const list = keyed(document.createElement("div"), "list");

    list.className = "search-section-list search-section-list--spaced";

    for (const s of sessions) {
      list.appendChild(
        keyed(buildProfessorSessionRow(s, ctx), `s:${s.roomId}:${s.inizio}:${s.title ?? ""}`),
      );
    }

    dayEl.appendChild(list);
    days.appendChild(dayEl);
  }

  return days;
}

function newProfessorPane(key: string) {
  const pane = document.createElement("div");

  pane.className = "search-pane search-pane--professor";
  buildProfessorPane(pane, key);

  return pane;
}

/* ── Results ⇄ professor view slide ──────────────────────────────────────
   Both panes sit side by side on a 200%-wide track. One spring, x (0 = the
   results on the left, 1 = the professor on the right), drives the track, a
   cross-fade between the two and the box's height, which morphs from one
   pane's height to the other's. Each pane keeps its own scroll offset while
   it's on the track (drawn as a translate), so the one leaving doesn't jump
   to its top first. The spring is only ever retargeted, never restarted:
   backing out while the professor is still sliding in turns the same motion
   around, velocity and all. ── */

// Response 0.32s, damping ratio 1: k = (2π / 0.32)², c = 2·√k.
const SLIDE_SPRING = { stiffness: 386, damping: 39.3, mass: 1 };

interface Slide {
  track: HTMLElement;
  left: HTMLElement;
  right: HTMLElement;
  leftScroll: number;
  rightScroll: number;
  spring: ClockedSpring;
  profKey: string;
  query: string;
  to: number;
  hL: number;
  hR: number;
  leftRest: number;
  rightRest: number;
}

let slide: Slide | null = null;

// A pane's resting height in the box, and how far it can scroll there.
function measurePane(pane: HTMLElement) {
  resultsEl.replaceChildren(pane);

  return { h: resultsEl.offsetHeight, maxScroll: resultsEl.scrollHeight - resultsEl.clientHeight };
}

// Vitrium's glass back button, pinned over the top-left corner of the box
// (outside the scrolling content, so it stays put as the schedule scrolls
// under it). It rides the slide: fading and growing in as the professor view
// comes in, and back out as it leaves.
let backBtn: HTMLButtonElement | null = null;

function setBackProgress(x: number) {
  if (!backBtn) return;
  backBtn.style.opacity = x >= 1 ? "" : `${x}`;
  backBtn.style.transform = x >= 1 ? "" : `scale(${0.6 + 0.4 * x})`;
  const shown = x > 0.5;

  backBtn.classList.toggle("search-pv-back--shown", shown);
  backBtn.inert = !shown;
}

function renderSlide() {
  if (!slide) return;
  const { spring, track, left, right, hL, hR } = slide;
  const x = Math.min(1, Math.max(0, spring.value));

  setBackProgress(x);
  // The box isn't really scrolled while the panes are on the track (their
  // offsets are translates), so the edge fade follows them instead.
  setEdgeFade(
    slide.leftScroll + (slide.rightScroll - slide.leftScroll) * x,
    slide.leftRest + (slide.rightRest - slide.leftRest) * x,
  );
  track.style.translate = `${-50 * x}% 0`;
  left.style.opacity = `${1 - 0.7 * x}`;
  right.style.opacity = `${0.3 + 0.7 * x}`;
  resultsEl.style.height = `${hL + (hR - hL) * x}px`;
}

function landSlide() {
  if (!slide) return;
  const { spring, to, left, right, leftScroll, rightScroll } = slide;

  slide = null;
  spring.dispose();
  const pane = to === 1 ? right : left;

  pane.style.translate = "";
  pane.style.opacity = "";
  resultsEl.classList.remove("search-overlay-results--sliding");
  resultsEl.style.height = "";
  resultsEl.replaceChildren(pane);
  resultsEl.scrollTop = to === 1 ? rightScroll : leftScroll;
  setBackProgress(to);
  updateEdgeFade();
  refreshActionable();
}

function retargetSlide(to: number) {
  if (!slide) return;
  slide.to = to;
  slide.spring.to(to, SLIDE_SPRING);
}

interface StartSlideArgs {
  left: HTMLElement;
  right: HTMLElement;
  leftScroll: number;
  rightScroll: number;
  from: 0 | 1;
  profKey: string;
  query: string;
}

// `from` is the side currently on screen (0 = left, 1 = right); the other one
// is the pane being navigated to.
function startSlide(args: StartSlideArgs) {
  const { left, right, from, profKey, query } = args;
  let { leftScroll, rightScroll } = args;
  const target = from === 0 ? right : left;

  if (reduceMotionMQ.matches) {
    resultsEl.replaceChildren(target);
    resultsEl.scrollTop = from === 0 ? rightScroll : leftScroll;
    setBackProgress(1 - from);
    fadeIn(target);
    refreshActionable();

    return;
  }

  const hOn = resultsEl.offsetHeight;
  const restOn = resultsEl.scrollHeight - resultsEl.clientHeight - resultsEl.scrollTop;
  const other = measurePane(target);
  const clampScroll = (v: number) => Math.max(0, Math.min(v, other.maxScroll));

  if (from === 0) rightScroll = clampScroll(rightScroll);
  else leftScroll = clampScroll(leftScroll);
  // How much is left below each pane's scroll position, for the edge fade.
  const restOther = other.maxScroll - (from === 0 ? rightScroll : leftScroll);

  const track = document.createElement("div");

  track.className = "search-slide-track";
  track.append(left, right);
  resultsEl.classList.add("search-overlay-results--sliding");
  resultsEl.replaceChildren(track);
  resultsEl.scrollTop = 0;
  left.style.translate = `0 ${-leftScroll}px`;
  right.style.translate = `0 ${-rightScroll}px`;

  const spring = new ClockedSpring(from, () => {
    if (!slide || slide.spring !== spring) return;
    renderSlide();

    if (spring.resting || isSettled(spring, slide.to)) landSlide();
  });

  slide = {
    track,
    left,
    right,
    leftScroll,
    rightScroll,
    spring,
    profKey,
    query,
    to: from,
    hL: from === 0 ? hOn : other.h,
    hR: from === 0 ? other.h : hOn,
    leftRest: from === 0 ? restOn : restOther,
    rightRest: from === 0 ? restOther : restOn,
  };
  // Nothing is selectable until a pane has landed.
  actionable = [];
  updateSelectionVisual();
  renderSlide();
  retargetSlide(1 - from);
}

function openProfessorView(key: string) {
  if (!isOpen) return;

  if (slide) {
    // Still sliding back to the results: the same professor turns it around.
    if (slide.to === 0 && slide.profKey === key) {
      currentView = "professor";
      currentProfessorKey = key;
      retargetSlide(1);

      return;
    }

    landSlide();
  }

  if (currentView === "professor") return;
  settleMorph();
  // SAFETY: resultsEl only ever holds the single pane div built by
  // newResultsPane/newProfessorPane, or nothing before the first render.
  const resultsPane = resultsEl.firstElementChild as HTMLElement | null;

  if (!resultsPane) return;
  resultsScrollPos = resultsEl.scrollTop;
  currentView = "professor";
  currentProfessorKey = key;
  startSlide({
    left: resultsPane,
    right: newProfessorPane(key),
    leftScroll: resultsScrollPos,
    rightScroll: 0,
    from: 0,
    profKey: key,
    query: input.value,
  });
}

function exitProfessorView() {
  if (currentView !== "professor") return;
  const profKey = currentProfessorKey!;

  currentView = "results";
  currentProfessorKey = null;

  if (slide) {
    // Still sliding in: the results it left are intact on the track, so just
    // turn around — unless the query has changed since.
    if (slide.to === 1 && slide.query === input.value) {
      retargetSlide(0);

      return;
    }

    landSlide();
  }

  // SAFETY: currentView was 'professor', so landSlide() (or the steady state
  // before it) left the professor pane div as resultsEl's only child.
  const profPane = resultsEl.firstElementChild as HTMLElement;
  const resultsPane = newResultsPane();

  buildResultsPane(resultsPane, input.value);
  startSlide({
    left: resultsPane,
    right: profPane,
    leftScroll: resultsScrollPos,
    rightScroll: resultsEl.scrollTop,
    from: 1,
    profKey,
    query: input.value,
  });
}

// Rebuilds whichever panel is currently showing — used when occupancy data
// finishes loading late (scheduleOccRecheck) or the language switches. The
// results animate into their new shape like any other render; the professor
// view is swapped in place.
function refreshActiveView() {
  landSlide();

  if (currentView === "professor" && currentProfessorKey) {
    const scrollTop = resultsEl.scrollTop;

    resultsEl.replaceChildren(newProfessorPane(currentProfessorKey));
    resultsEl.scrollTop = scrollTop;
    refreshActionable();
  } else {
    renderResults(input.value);
  }
}

/* ── Results rendering ───────────────────────────────────────────────────── */

// Every animated piece of the results carries a data-anim-key, stable across
// renders for the same thing, which is what search-overlay-motion.ts matches on.
// Every call site passes an item's own `.type` as `type`, so each cast below
// matches the item's actual (discriminated) shape.
function animKeyFor(type: SearchItem["type"], item: SearchItem) {
  switch (type) {
    case "classroom":
      // SAFETY: type === "classroom".
      return `c:${(item as ClassroomSearchItem).room.id}`;
    case "building": {
      // SAFETY: type === "building".
      const b = item as BuildingSearchItem;

      return `b:${b.campusId}:${b.name}`;
    }

    case "professor":
      // SAFETY: type === "professor".
      return `p:${(item as ProfessorSearchItem).key}`;
    default:
      // SAFETY: the only remaining types are "exam"/"lesson".
      return `${type}:${itemKey(item as OccupationSearchItem)}`;
  }
}

function keyed<T extends HTMLElement>(el: T, key: string) {
  el.dataset.animKey = key;

  return el;
}

function block(key: string) {
  const el = document.createElement("div");

  el.className = "search-block";

  return keyed(el, key);
}

function newResultsPane() {
  const pane = document.createElement("div");

  pane.className = "search-pane search-pane--results";

  return keyed(pane, "results");
}

let expandedSections = new Set<Section["key"]>();

let lastQuery: string | null = null;

// Builds the results list (Top Hit + sections) into `container`, as one
// keyed block per section. Doesn't touch currentView/currentProfessorKey —
// callers decide whether this is a plain re-render or the landing pane of a
// professor-view exit.
function buildResultsPane(container: HTMLElement, query: string) {
  const q = query.trim();

  clearTimeout(occRecheckTimer);

  if (!q) {
    lastQuery = null;

    return; // idle: empty results area, placeholder styling handles the hint
  }

  if (q !== lastQuery) {
    expandedSections.clear();
    expandedItemKey = null;
    lastQuery = q;
  }

  const result = runSearch(q);
  const { topHit, classrooms, buildings, professors, exams, lessons } = result;

  if (!topHit) {
    const empty = block("empty");
    const state = document.createElement("div");

    state.className = "search-empty-state";
    state.innerHTML = `
      <i class="hgi-stroke hgi-search-remove empty-container-icon" aria-hidden="true"></i>
      <p class="empty-container-title">${t("search.emptyTitle")}</p>
      <p class="empty-container-subtitle">${t("search.emptySubtitle")}</p>
    `;
    empty.appendChild(state);
    container.appendChild(empty);

    if (!hasOccupationData()) scheduleOccRecheck(query);

    return;
  }

  const ctx: RowContext = {
    q,
    corrections: result.corrections,
    dateFmt: new Intl.DateTimeFormat(getLocale(), {
      weekday: "short",
      day: "numeric",
      month: "short",
    }),
    timeFmt: createTimeFormatter(),
    large: false,
  };

  const top = block("tophit");

  top.appendChild(keyed(sectionLabel(t("search.topHit"), "hgi-sparkles"), "label"));
  // A swap slot: a different Top Hit cross-fades in place of the old one
  // while the slot's height morphs between them.
  const slot = keyed(document.createElement("div"), "slot");

  slot.className = "search-tophit-slot";
  slot.setAttribute("data-anim-swap", "");
  // SAFETY: TOP_HIT_BUILD is looked up and called with the same topHit's
  // own `.type`, matching the entry's expected item shape.
  const topRow = TOP_HIT_BUILD[topHit.type](topHit as never, { ...ctx, large: true });
  const topCard = keyed(document.createElement("div"), `hit:${animKeyFor(topHit.type, topHit)}`);

  topCard.className = "search-tophit-row"; // same grouped-list background as the sections below

  if (topHit.type === "professor") {
    topCard.classList.add("search-tophit-row--professor");
    // SAFETY: type === "professor" was just checked above.
    topCard.style.setProperty(
      "--prof-hue",
      String(hueFromKey((topHit as ProfessorSearchItem).key)),
    );
  }

  topCard.appendChild(topRow);
  slot.appendChild(topCard);
  top.appendChild(slot);
  container.appendChild(top);

  const sectionData = { classrooms, buildings, professors, exams, lessons };

  for (const sec of SECTIONS) {
    const data = sectionData[sec.key];
    // The Top Hit isn't repeated in its own section.
    const items = data.items.filter((it) => it !== topHit);

    if (!items.length) continue;

    const blk = block(`sec:${sec.key}`);

    blk.appendChild(keyed(sectionLabel(t(sec.labelKey), sec.icon), "label"));
    const list = keyed(document.createElement("div"), "list");

    list.className = "search-section-list";

    if (sec.spaced) list.classList.add("search-section-list--spaced");
    const expanded = expandedSections.has(sec.key);
    const shown = expanded ? items : items.slice(0, SECTION_CAP);

    for (const item of shown) {
      // SAFETY: `items` came from sectionData[sec.key], whose items always
      // carry `sec.type`, matching sec.build's expected item shape.
      list.appendChild(keyed(sec.build(item as never, ctx), animKeyFor(sec.type, item)));
    }

    blk.appendChild(list);

    if (!expanded && items.length > SECTION_CAP) {
      const remaining = items.length - SECTION_CAP;
      const more = keyed(document.createElement("button"), "more");

      more.type = "button";
      more.className = "search-show-all";
      more.dataset.row = "";
      more.tabIndex = -1;
      more.textContent = t("search.showAll").replace("{n}", String(remaining));
      more.addEventListener("click", (e) => {
        e.stopPropagation();
        expandedSections.add(sec.key);
        renderResults(input.value);
      });
      blk.appendChild(more);
    } else if (data.total - 1 > items.length) {
      blk.appendChild(keyed(tooManyNotice(items.length), "notice"));
    }

    container.appendChild(blk);
  }

  if (!hasOccupationData()) scheduleOccRecheck(query);
}

/* ── Scroll-edge fade ─────────────────────────────────────────────────────
   The results scroller's mask (search-overlay.css) fades each edge by as much
   as there is left to scroll that way, capped at --search-fade — so the fade
   grows in as the list leaves its top, and is gone again at its end. */

function setEdgeFade(top: number, bottom: number) {
  resultsEl.style.setProperty("--search-fade-top", `${Math.max(0, top)}px`);
  resultsEl.style.setProperty("--search-fade-bottom", `${Math.max(0, bottom)}px`);
}

function updateEdgeFade() {
  if (slide) return; // renderSlide() drives it while the panes are on the track
  const top = resultsEl.scrollTop;

  setEdgeFade(top, resultsEl.scrollHeight - resultsEl.clientHeight - top);
}

let edgeFadeRaf = 0;

function scheduleEdgeFade() {
  if (edgeFadeRaf) return;
  edgeFadeRaf = requestAnimationFrame(() => {
    edgeFadeRaf = 0;
    updateEdgeFade();
  });
}

function initEdgeFade(events: AbortController) {
  resultsEl.addEventListener("scroll", updateEdgeFade, { passive: true, signal: events.signal });
  const ro = new ResizeObserver(scheduleEdgeFade);

  ro.observe(resultsEl);
  // The content is swapped wholesale on every render; follow whichever pane
  // is current.
  let watched: Element | null = null;

  const mo = new MutationObserver(() => {
    const pane = resultsEl.firstElementChild;

    if (pane === watched) return;

    if (watched) ro.unobserve(watched);
    watched = pane;

    if (pane) ro.observe(pane);
    scheduleEdgeFade();
  });

  mo.observe(resultsEl, { childList: true });
  events.signal.addEventListener("abort", () => {
    ro.disconnect();
    mo.disconnect();
  });
}

/* ── Results box ──────────────────────────────────────────────────────────
   The glass box materialises under the search bar (scaling up from its top
   edge, as if dropping out of the bar) when the first results arrive, and
   dissolves back into it when the field is cleared — its content stays put
   until then, and is only emptied once it's gone. */

const BOX_KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: "scale(0.96) translateY(-6px)" },
  { opacity: 1, transform: "scale(1) translateY(0)" },
];

const BOX_KEYFRAMES_FADE: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

let boxShown = false;

let boxAnim: Animation | null = null;

function boxEasing() {
  const spring = getComputedStyle(document.documentElement).getPropertyValue("--vt-spring").trim();

  return spring && CSS.supports("animation-timing-function", spring)
    ? spring
    : "cubic-bezier(0.16, 1, 0.3, 1)";
}

function setResultsBox(show: boolean, animate = true) {
  if (show === boxShown) return;
  boxShown = show;
  resultsEl.classList.toggle("search-overlay-results--leaving", !show);

  const empty = !resultsEl.firstElementChild;
  const frame = resultsEl.parentElement!;

  if (!animate || empty) {
    boxAnim?.cancel();
    boxAnim = null;

    if (!show) {
      settleMorph();
      resultsEl.replaceChildren();
    }

    return;
  }

  if (boxAnim) {
    boxAnim.reverse();

    return;
  }

  const reduce = reduceMotionMQ.matches;
  const frames = reduce ? BOX_KEYFRAMES_FADE : BOX_KEYFRAMES;

  const anim = frame.animate(show ? frames : [...frames].reverse(), {
    duration: reduce ? 180 : 280,
    easing: reduce ? "ease-out" : boxEasing(),
    fill: "both",
  });

  boxAnim = anim;
  anim.onfinish = () => {
    if (boxAnim !== anim) return;
    boxAnim = null;

    if (!boxShown) resultsEl.replaceChildren();
    anim.cancel();
  };
}

interface RenderOptions {
  animate?: boolean;
}

// Top-level entry point for every results render: a typed query, opening the
// overlay, "Show all", or a data/language refresh. Animated against whatever
// is on screen unless `animate` is false. Typing while the professor view is
// open slides back to the results for the new query.
function renderResults(query: string, options: RenderOptions = {}) {
  const animate = options.animate ?? true;

  clearTimeout(occRecheckTimer);

  if (!query.trim()) {
    lastQuery = null;
    landSlide();
    currentView = "results";
    currentProfessorKey = null;
    setBackProgress(0);
    setResultsBox(false, animate);
    actionable = [];
    updateSelectionVisual();

    return;
  }

  if (currentView === "professor") {
    if (animate) {
      exitProfessorView();

      return;
    }

    landSlide();
  }

  currentView = "results";
  currentProfessorKey = null;
  setBackProgress(0);
  const pane = newResultsPane();

  buildResultsPane(pane, query);
  morphInto(resultsEl, pane, { animate });
  setResultsBox(true, animate);
  refreshActionable();
  frame(syncHeaderClearance);
}

let occRecheckTimer = 0;

function scheduleOccRecheck(query: string, tries = 0) {
  clearTimeout(occRecheckTimer);

  if (tries > 6) return;
  occRecheckTimer = window.setTimeout(() => {
    if (!isOpen || input.value !== query) return;

    if (hasOccupationData()) refreshActiveView();
    else scheduleOccRecheck(query, tries + 1);
  }, 1200);
}

/* ── Keyboard navigation (desktop only) ─────────────────────────────────────
   Focus stays in the input; ↑/↓ move a visual selection across every
   data-row element in DOM order (Top Hit, section rows, "Show all", expanded
   session rows, or — inside the professor view — every session row), Enter
   activates it. The Top Hit is selected by default after every render. */

const desktopMQ = matchMedia("(min-width: 600px)");

let actionable: HTMLElement[] = [];

let selectedIndex = 0;

function refreshActionable() {
  actionable = [...resultsEl.querySelectorAll<HTMLElement>("[data-row]")];
  selectedIndex = 0;
  updateSelectionVisual();
}

// The visible "selected" highlight is a desktop-only, keyboard-nav concept —
// on mobile (no arrow keys) every render would otherwise permanently paint
// the Top Hit as if pressed, which reads as a stray highlighted box rather
// than a hint.
function updateSelectionVisual() {
  const active = desktopMQ.matches;

  actionable.forEach((el, i) =>
    el.classList.toggle("search-row--selected", active && i === selectedIndex),
  );
  const current = active ? actionable[selectedIndex] : null;

  if (current) {
    if (!current.id) current.id = `search-row-${Math.random().toString(36).slice(2, 9)}`;
    input.setAttribute("aria-activedescendant", current.id);
    current.scrollIntoView({ block: "nearest" });
  } else {
    input.removeAttribute("aria-activedescendant");
  }
}

function onInputKeyDown(e: KeyboardEvent) {
  if (!desktopMQ.matches || !actionable.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, actionable.length - 1);
    updateSelectionVisual();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelectionVisual();
  } else if (e.key === "Enter") {
    e.preventDefault();
    actionable[selectedIndex]?.click();
  }
}

/* ── Scroll lock ──────────────────────────────────────────────────────────
   The panel usually doesn't fill the viewport, so a wheel/touch scroll over
   it (or the backdrop) would otherwise fall through to the tab behind.
   `.search-scrollable` marks the one element allowed to consume the gesture
   (only the results scroller here), and only when it actually overflows. */

function preventScroll(e: Event) {
  if (!(e.target instanceof Element)) return;
  const target = e.target;

  if (target.closest(".search-overlay-header")) return;
  const scrollable = target.closest(".search-overlay-results");

  if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) return;
  e.preventDefault();
}

function lockScroll(events: AbortController) {
  window.addEventListener("wheel", preventScroll, { passive: false, signal: events.signal });
  window.addEventListener("touchmove", preventScroll, { passive: false, signal: events.signal });
}

/* ── Viewport / open / close plumbing ───────────────────────────────────── */

let overlay: HTMLElement;

let panel: HTMLElement;

let input: HTMLInputElement;

let clearBtn: HTMLElement;

let closeBtn: HTMLElement;

let resultsEl: HTMLElement;

let isOpen = false;

let debounce = 0;

let savedScrollPos = 0;

let currentView: "results" | "professor" = "results";

let currentProfessorKey: string | null = null;

let resultsScrollPos = 0;

const reduceMotionMQ = matchMedia("(prefers-reduced-motion: reduce)");

// Shared view-transition name: the bottom-nav search FAB morphs into the
// overlay's search bar on open, and back on close.
const fabEl = () => document.querySelector<HTMLElement>(".lg-tabbar__prominent");

const barEl = () => overlay.querySelector<HTMLElement>(".search-bar-wrapper");

function beginChromeVT() {
  document.documentElement.classList.add("search-vt");
}

function endChromeVT() {
  frame(() =>
    frame(() => {
      document.documentElement.classList.remove("search-vt");
    }),
  );
}

// Hide the header only once the results box has actually grown tall enough to
// reach up behind it (body.search-covers-header, consumed by the mobile CSS).
function syncHeaderClearance() {
  const header = document.querySelector(".header");

  if (!header || !panel || !isOpen) return;
  const covers = panel.getBoundingClientRect().top < header.getBoundingClientRect().bottom + 8;

  document.body.classList.toggle("search-covers-header", covers);
}

// Mobile anchors the search bar at a fixed top offset (the header's old
// slot), but iOS Safari can pan the *visual* viewport down when the keyboard
// opens rather than shrinking it, which would carry a `top`-anchored fixed
// element off screen with it. Track visualViewport and expose its offset and
// height as custom properties so the CSS can compensate.
function onViewportResize() {
  const vv = window.visualViewport;

  if (!vv) return;
  overlay.style.setProperty("--search-vv-top", vv.offsetTop + "px");
  overlay.style.setProperty("--search-vv-height", vv.height + "px");
  frame(syncHeaderClearance);
}

function startViewportTracking(events: AbortController) {
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

  overlay.style.removeProperty("--search-vv-top");
  overlay.style.removeProperty("--search-vv-height");
}

function conceal() {
  overlay.classList.remove("visible");
  overlay.setAttribute("hidden", "");
  document.body.classList.remove("search-overlay-open", "search-covers-header");
  clearTimeout(occRecheckTimer);
  stopViewportTracking();
  window.scrollTo(0, savedScrollPos);
  // Nothing is left mid-flight for the next open: the slide and any results
  // morph land where they were heading, and a dissolving box is finished off.
  landSlide();
  settleMorph();

  if (boxAnim) {
    boxAnim.cancel();
    boxAnim = null;

    if (!boxShown) resultsEl.replaceChildren();
  }
}

// Land the caret in the field ready to type; select any leftover query so the
// first keystroke replaces it. Must run inside the FAB-tap callstack — iOS
// Safari only opens the keyboard for a focus() that's user-initiated.
function grabInput() {
  input.focus({ preventScroll: true });
  input.select();
}

// Drop the overlay with no transition of its own — for when the click that
// dismisses it also navigates somewhere that runs its own transition (info
// page, classroom detail, a building jump to the Campus tab), so the two
// don't fight.
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

export function initSearchOverlay() {
  const events = new AbortController();
  const frames = new Set<number>();
  const timers = new Set<number>();

  frame = (callback: FrameRequestCallback) => {
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

  overlay = document.getElementById("search-overlay")!;
  panel = overlay.querySelector<HTMLElement>(".search-overlay-panel")!;
  input = document.querySelector<HTMLInputElement>("#classroom-search-input")!;
  clearBtn = document.getElementById("classroom-search-clear")!;
  closeBtn = document.getElementById("search-overlay-close")!;
  resultsEl = document.getElementById("search-overlay-results")!;

  backBtn = createBackButton({
    label: t("search.backToResults"),
    onClick: (e) => {
      e.stopPropagation();
      exitProfessorView();
    },
  });
  backBtn.classList.add("search-pv-back");
  resultsEl.parentElement!.appendChild(backBtn);
  setBackProgress(0);
  initEdgeFade(events);

  async function open() {
    if (isOpen || !overlay) return;
    isOpen = true;
    savedScrollPos = window.scrollY;

    overlay.removeAttribute("hidden");
    grabInput();
    lockScroll(events);

    const fab = fabEl();

    if (document.startViewTransition && fab) {
      fab.style.viewTransitionName = MORPH_NAME;
      beginChromeVT();

      const vt = document.startViewTransition(() => {
        if (disposed) return;
        fab.style.viewTransitionName = "";
        document.body.classList.add("search-overlay-open");
        overlay.classList.add("visible");
        startViewportTracking(events);
        const bar = barEl();

        if (bar) bar.style.viewTransitionName = MORPH_NAME;
      });

      vt.finished.finally(() => {
        if (disposed) return;
        const bar = barEl();

        if (bar) bar.style.viewTransitionName = "";
        endChromeVT();

        if (isOpen && document.activeElement !== input) grabInput();
      });
    } else {
      document.body.classList.add("search-overlay-open");
      frame(() => overlay.classList.add("visible"));
      startViewportTracking(events);
      grabInput();
    }

    // The open transition is already moving the whole panel in.
    if (isOpen) renderResults(input.value, { animate: false });
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

  closeBtn.addEventListener("click", () => close(), { signal: events.signal });

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
      if (!isOpen || e.key !== "Escape") return;

      // Esc backs out of the professor view first; only closes the overlay
      // from the results list.
      if (currentView === "professor") exitProfessorView();
      else close();
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

  // Safety net: any other hash route opened while we're open takes it down too.
  // Not the classroom page: opening a result morphs the tapped row into it, so
  // the overlay must still be on screen for that transition's old snapshot —
  // classroom-detail.tsx hides it inside its own transition instead (see
  // dismissSearchOverlayInstant).
  window.addEventListener(
    "poliaule:routechange",
    () => {
      if (isOpen && location.hash && !location.hash.startsWith("#classroom/")) dismissInstant();
    },
    { signal: events.signal },
  );

  clearBtn.addEventListener(
    "click",
    () => {
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

  input.addEventListener("keydown", onInputKeyDown, { signal: events.signal });

  const stopLanguage = onLanguageSwitch(() => {
    backBtn?.setAttribute("aria-label", t("search.backToResults"));

    if (isOpen) refreshActiveView();
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
    settleMorph();
    landSlide();
    backBtn?.remove();
    backBtn = null;
    document.body.classList.remove("search-overlay-open", "search-covers-header");
    document.documentElement.classList.remove("search-vt");
  };
}

// Assigned inside initSearchOverlay (needs the mount's AbortController for
// pending-frame bookkeeping); module-level helpers above call through it.
let frame: (callback: FrameRequestCallback) => number = (cb) => requestAnimationFrame(cb);
