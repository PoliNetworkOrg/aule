// Keyed layout animation for the search results (search-overlay-controller.ts
// owns the imperative results DOM, since a FLIP-style diff against the live
// on-screen state can't coexist with React's own reconciliation of the same
// nodes — this module operates purely on plain DOM elements it's handed).
//
// Every render builds a brand-new results pane; morphInto() swaps it in and
// animates the difference against whatever was on screen, matching elements
// by their data-anim-key (and recursing into keyed elements that are on both
// sides):
//   enter  a key only in the new tree: grows from 0 height (so everything
//          below is pushed down by layout, and the glass panel resizes with
//          it), fading and scaling in
//   exit   a key only in the old tree: the old node is put back in the new
//          tree where it was (a "ghost": inert, stripped of its row/ids) and
//          collapses to 0 height while fading out, then is removed
//   keep   a key on both sides: glides from where it visibly was to where it
//          now sits (reshuffles), with a translate recomputed every frame
//          against the live layout, so it stays exact while the siblings
//          around it grow and collapse
// A parent marked data-anim-swap (the Top Hit slot) replaces its child in
// place instead: the old one fades out on top, absolutely positioned, while
// the new one fades in and the slot's own height morphs between the two.
//
// Everything runs off one critically damped spring. A render landing
// mid-flight starts from the current on-screen state — heights, opacities
// and positions are all read back from the live DOM, ghosts included (a
// ghost whose key comes back is picked up from wherever it had faded to) —
// so fast typing never jumps.

// Response 0.3s, damping ratio 1: k = (2π / 0.3)², c = 2·√k. On the quick
// side on purpose — this runs on every pause in typing.
const SPRING = { stiffness: 439, damping: 42, mass: 1 };

const ENTER_SCALE = 0.97;

// Ghosts fade out alongside their collapse, gone just before it ends: faded
// out any sooner, they left a stretch of blank list still closing up.
const EXIT_FADE_END = 0.85;

// A Top Hit swap is two different cards cross-fading in one spot; a touch of
// blur blends them instead of showing two sharp objects overlapping.
const SWAP_BLUR = 2;

// For anything growing or collapsing on its height: clipped to its box
// (clip-path, since `overflow` doesn't clip a <button> row in Chromium — its
// content spilled over the neighbours), and its content pinned to the top so
// it's revealed like a drawer rather than squeezed from both ends (rows
// centre their content, which at full height is the same place).
const GROW_CLIP: Partial<CSSStyleDeclaration> = {
  overflow: "clip",
  clipPath: "inset(0)",
  alignItems: "flex-start",
};

const reduceMotionMQ = matchMedia("(prefers-reduced-motion: reduce)");

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function keyedKids(el: Element) {
  const out: HTMLElement[] = [];

  for (const c of el.children) {
    if (c instanceof HTMLElement && c.dataset.animKey != null) out.push(c);
  }

  return out;
}

const num = (v: string | undefined, fallback: number) =>
  v === "" || v == null || Number.isNaN(Number.parseFloat(v)) ? fallback : Number.parseFloat(v);

const ANIMATED_PROPS = [
  "height",
  "marginTop",
  "paddingTop",
  "paddingBottom",
  "opacity",
  "scale",
  "translate",
  "overflow",
  "boxSizing",
  "transformOrigin",
  "clipPath",
  "alignItems",
  "position",
  "top",
  "left",
  "right",
  "pointerEvents",
  "filter",
  // Written every frame: a CSS transition on any of them (the Top Hit
  // card's press scale) would trail behind each write.
  "transition",
] as const;

interface TreeMeasurement {
  h: number;
  animatingHeight: boolean;
  mt: number;
  pt: number;
  pb: number;
  op: number;
  sc: number;
  rel: number;
  ghost: boolean;
}

let running: { plan: Plan; spring: ClockedSpring } | null = null;

// A spring with its own clock, for the results morph and the professor
// slide. Not Vitrium's Spring: its shared loop takes the first step's dt
// from the frame's rAF timestamp minus the performance.now() it woke at, and
// when the wake-up comes from a long task (a results render is one) that
// timestamp is the *earlier* of the two. The negative step runs the
// integrator backwards, and the progress shot to ~1.5 on the very first
// frame — the kept rows overshooting their place, and ghost heights going
// negative (which CSS rejects, leaving them at full height as empty rows
// until the end). Here dt is measured between two performance.now() reads,
// and clamped.
export class ClockedSpring {
  value: number;
  v = 0;
  target: number;
  resting = true;
  onFrame: () => void;
  raf = 0;
  last = 0;
  eps = 0.001;
  private k = 0;
  private c = 0;
  private m = 1;

  constructor(value: number, onFrame: () => void) {
    this.value = value;
    this.target = value;
    this.onFrame = onFrame;
  }

  to(target: number, spring: { stiffness: number; damping: number; mass?: number }) {
    this.target = target;
    this.k = spring.stiffness;
    this.c = spring.damping;
    this.m = spring.mass ?? 1;
    this.resting = false;

    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private tick = () => {
    const now = performance.now();
    const dt = Math.min(Math.max(now - this.last, 0), 64) / 1000;

    this.last = now;
    const n = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / n;

    for (let i = 0; i < n; i++) {
      const f = -this.k * (this.value - this.target) - this.c * this.v;

      this.v += (f / this.m) * h;
      this.value += this.v * h;
    }

    if (Math.abs(this.v) < this.eps && Math.abs(this.value - this.target) < this.eps) {
      this.value = this.target;
      this.v = 0;
      this.resting = true;
    }

    this.raf = this.resting ? 0 : requestAnimationFrame(this.tick);
    this.onFrame();
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resting = true;
  }
}

// A critically damped spring spends its last few hundred ms creeping through
// the final pixel; call it arrived once what's left is under half a pixel
// even on the longest moves (~1000px down a long results list), rather than
// waiting out the spring's own, much stricter, rest check.
export function isSettled(spring: ClockedSpring, target: number) {
  return Math.abs(spring.value - target) < 0.0005 && Math.abs(spring.v) < 0.03;
}

function clearStyles(el: HTMLElement) {
  for (const p of ANIMATED_PROPS) {
    // SAFETY: ANIMATED_PROPS is a fixed list of real CSSStyleDeclaration
    // property names (checked at the const's declaration site above).
    el.style[p as never] = "";
  }

  if (!el.getAttribute("style")) el.removeAttribute("style");
}

// Vertical padding, animated along with the height: a border-box can't get
// shorter than its own padding, so a row collapsing on height alone would
// stop at ~17px of empty row and only vanish when removed.
function paddingOf(el: HTMLElement) {
  const cs = getComputedStyle(el);

  return {
    pt: Number.parseFloat(cs.paddingTop) || 0,
    pb: Number.parseFloat(cs.paddingBottom) || 0,
  };
}

// Border-box height, unrounded (offsetHeight's whole pixels left every row
// that grew in a fraction short, which added up down the list and snapped at
// the end) and without the scale this engine may have on it.
function boxHeight(el: HTMLElement) {
  return el.getBoundingClientRect().height / num(el.style.scale, 1);
}

// Current on-screen state of every keyed element in the old tree.
function measureTree(root: Element) {
  const out = new Map<HTMLElement, TreeMeasurement>();

  for (const el of root.querySelectorAll<HTMLElement>("[data-anim-key]")) {
    const r = el.getBoundingClientRect();
    const pr = el.parentElement!.getBoundingClientRect();
    const padding = paddingOf(el);

    out.set(el, {
      h: boxHeight(el),
      animatingHeight: el.style.height !== "",
      mt: Number.parseFloat(getComputedStyle(el).marginTop) || 0,
      pt: padding.pt,
      pb: padding.pb,
      op: num(el.style.opacity, 1),
      sc: num(el.style.scale, 1),
      rel: r.top - pr.top,
      ghost: el.dataset.animGhost != null,
    });
  }

  return out;
}

// Takes a leaving node out of every interaction: no clicks, no keyboard nav
// (the controller walks [data-row]), no accordion lookups, no duplicate ids.
function toGhost(el: HTMLElement) {
  if (el.dataset.animGhost != null) return;
  el.dataset.animGhost = "";
  el.inert = true;
  el.setAttribute("aria-hidden", "true");

  for (const n of [el, ...el.querySelectorAll<HTMLElement>("[data-row], [data-item-key], [id]")]) {
    n.removeAttribute("data-row");
    n.removeAttribute("data-item-key");
    n.removeAttribute("id");
  }
}

interface EnterEntry {
  el: HTMLElement;
  swap: boolean;
  H: number;
  M: number;
  pt: number;
  pb: number;
}

interface ExitEntry {
  el: HTMLElement;
  from: TreeMeasurement;
  overlay: boolean;
}

interface KeepEntry {
  el: HTMLElement;
  from: TreeMeasurement;
  resize: boolean;
  ty: number;
  H: number;
  finalRel: number;
}

interface Plan {
  enter: EnterEntry[];
  exit: ExitEntry[];
  keep: KeepEntry[];
}

function diff(
  oldGroup: Element,
  newGroup: Element,
  old: Map<HTMLElement, TreeMeasurement>,
  plan: Plan,
) {
  const olds = keyedKids(oldGroup);
  const byKey = new Map(olds.map((o) => [o.dataset.animKey, o]));
  const swap = newGroup.hasAttribute("data-anim-swap");
  const matched = new Map<HTMLElement, HTMLElement>();

  for (const n of keyedKids(newGroup)) {
    const o = byKey.get(n.dataset.animKey);

    if (!o) {
      plan.enter.push({ el: n, swap, H: 0, M: 0, pt: 0, pb: 0 });
      continue;
    }

    byKey.delete(n.dataset.animKey);
    matched.set(o, n);
    const from = old.get(o)!;

    plan.keep.push({ el: n, from, resize: from.animatingHeight, ty: 0, H: 0, finalRel: 0 });

    if (keyedKids(o).length || keyedKids(n).length) diff(o, n, old, plan);
  }

  // Leftovers become ghosts, re-inserted right after whatever preceded them
  // on screen, so they collapse in their own place.
  let anchor: HTMLElement | null = null;
  let ghosted = false;

  for (const o of olds) {
    const matchedInto = matched.get(o);

    if (matchedInto) {
      anchor = matchedInto;
      continue;
    }

    toGhost(o);
    ghosted = true;

    if (swap) {
      newGroup.appendChild(o);
      plan.exit.push({ el: o, from: old.get(o)!, overlay: true });
    } else {
      if (anchor) anchor.after(o);
      else newGroup.prepend(o);
      anchor = o;
      plan.exit.push({ el: o, from: old.get(o)!, overlay: false });
    }
  }

  // A swap slot that just lost its child morphs its own height between the
  // outgoing and incoming one.
  if (swap && ghosted) {
    const rec = plan.keep.find((k) => k.el === newGroup);

    if (rec) rec.resize = true;
  }
}

function render(plan: Plan, p: number) {
  const fadeOut = 1 - clamp01(p / EXIT_FADE_END);

  for (const e of plan.enter) {
    if (!e.swap) {
      e.el.style.height = `${Math.max(0, lerp(0, e.H, p))}px`;
      e.el.style.marginTop = `${Math.max(0, lerp(0, e.M, p))}px`;
      e.el.style.paddingTop = `${Math.max(0, lerp(0, e.pt, p))}px`;
      e.el.style.paddingBottom = `${Math.max(0, lerp(0, e.pb, p))}px`;
    } else e.el.style.filter = `blur(${(1 - p) * SWAP_BLUR}px)`;
    e.el.style.opacity = `${p}`;
    e.el.style.scale = `${lerp(ENTER_SCALE, 1, p)}`;
  }

  for (const x of plan.exit) {
    if (!x.overlay) {
      x.el.style.height = `${Math.max(0, lerp(x.from.h, 0, p))}px`;
      x.el.style.marginTop = `${Math.max(0, lerp(x.from.mt, 0, p))}px`;
      x.el.style.paddingTop = `${Math.max(0, lerp(x.from.pt, 0, p))}px`;
      x.el.style.paddingBottom = `${Math.max(0, lerp(x.from.pb, 0, p))}px`;
    } else {
      x.el.style.filter = `blur(${(1 - fadeOut) * SWAP_BLUR}px)`;
    }

    x.el.style.opacity = `${x.from.op * fadeOut}`;
    x.el.style.scale = `${lerp(x.from.sc, ENTER_SCALE, p)}`;
  }

  for (const k of plan.keep) {
    if (k.resize) k.el.style.height = `${Math.max(0, lerp(k.from.h, k.H, p))}px`;

    if (k.from.op !== 1) k.el.style.opacity = `${lerp(k.from.op, 1, p)}`;

    if (k.from.sc !== 1) k.el.style.scale = `${lerp(k.from.sc, 1, p)}`;
  }

  // Reads after all the writes above (one layout), then the translates,
  // which don't touch layout. Each kept node is placed at the interpolation
  // between where it was and where it ends up, relative to its parent,
  // whatever the layout currently puts it at.
  const layoutRel = plan.keep.map((k) => {
    const r = k.el.getBoundingClientRect();

    return r.top - k.ty - k.el.parentElement!.getBoundingClientRect().top;
  });

  plan.keep.forEach((k, i) => {
    k.ty = lerp(k.from.rel, k.finalRel, p) - layoutRel[i];
    k.el.style.translate = Math.abs(k.ty) < 0.1 ? "" : `0 ${k.ty}px`;
  });
}

function finish() {
  if (!running) return;
  const { plan, spring } = running;

  running = null;
  spring.dispose();

  for (const x of plan.exit) x.el.remove();

  for (const e of plan.enter) clearStyles(e.el);

  for (const k of plan.keep) clearStyles(k.el);
}

/** The reduced-motion stand-in for a movement: the new content fades in. */
export function fadeIn(el: HTMLElement) {
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: "ease-out" });
}

/** Jumps any in-flight results animation to its end state. */
export function settleMorph() {
  finish();
}

interface MorphOptions {
  animate?: boolean;
  scroller?: HTMLElement;
}

/**
 * Replaces root's content with `next`, animating from what was there before
 * when both are the same keyed pane. `scroller` is the scroll container
 * whose position to keep, when that isn't root itself.
 */
export function morphInto(root: HTMLElement, next: HTMLElement, options: MorphOptions = {}) {
  const animate = options.animate ?? true;
  const scroller = options.scroller ?? root;
  // SAFETY: every caller only ever mounts plain <div> panes into `root`.
  const prev = root.firstElementChild as HTMLElement | null;

  const canMorph =
    animate &&
    !reduceMotionMQ.matches &&
    !!prev &&
    root.children.length === 1 &&
    prev.dataset.animKey != null &&
    prev.dataset.animKey === next.dataset.animKey;

  if (!canMorph) {
    finish();
    root.replaceChildren(next);

    // Reduced motion still gets told that the results changed — as a short
    // fade, with nothing moving or resizing.
    if (animate && reduceMotionMQ.matches && prev) fadeIn(next);

    return;
  }

  // Read the live state (including a morph still in flight) before touching
  // anything, then drop the old animation where it stands: every node it was
  // styling is either discarded with the old pane or restyled below.
  const old = measureTree(prev);

  if (running) {
    running.spring.dispose();
    running = null;
  }

  const scrollTop = scroller.scrollTop;

  root.replaceChildren(next);
  const plan: Plan = { enter: [], exit: [], keep: [] };

  diff(prev, next, old, plan);

  // End state first, to measure where everything lands.
  for (const x of plan.exit) {
    x.el.style.pointerEvents = "none";
    x.el.style.transformOrigin = "50% 0";

    if (x.overlay) {
      Object.assign(x.el.style, {
        position: "absolute",
        top: `${x.from.rel}px`,
        left: "0",
        right: "0",
      });
    } else {
      Object.assign(x.el.style, {
        ...GROW_CLIP,
        boxSizing: "border-box",
        height: "0px",
        marginTop: "0px",
        paddingTop: "0px",
        paddingBottom: "0px",
      });
    }
  }

  for (const e of plan.enter) {
    e.H = boxHeight(e.el);
    e.M = Number.parseFloat(getComputedStyle(e.el).marginTop) || 0;
    const padding = paddingOf(e.el);

    e.pt = padding.pt;
    e.pb = padding.pb;
  }

  for (const k of plan.keep) {
    if (k.resize) k.H = boxHeight(k.el);
    k.finalRel = k.el.getBoundingClientRect().top - k.el.parentElement!.getBoundingClientRect().top;
  }

  if (
    !plan.enter.length &&
    !plan.exit.length &&
    plan.keep.every(
      (k) =>
        !k.resize && k.from.op === 1 && k.from.sc === 1 && Math.abs(k.from.rel - k.finalRel) < 0.5,
    )
  ) {
    // Nothing moved or changed shape (the same results re-rendered): no
    // spring, just put the scroll back.
    scroller.scrollTop = scrollTop;

    return;
  }

  // Then the start state.
  for (const it of [...plan.enter, ...plan.exit, ...plan.keep]) it.el.style.transition = "none";

  for (const e of plan.enter) {
    e.el.style.transformOrigin = "50% 0";

    if (!e.swap) Object.assign(e.el.style, { ...GROW_CLIP, boxSizing: "border-box" });
  }

  for (const k of plan.keep) {
    k.el.style.transformOrigin = "50% 0";

    if (k.resize) Object.assign(k.el.style, { ...GROW_CLIP, boxSizing: "border-box" });
  }

  render(plan, 0);
  // The end-state measurement above may have briefly shortened the content
  // and clamped the scroll.
  scroller.scrollTop = scrollTop;

  const spring = new ClockedSpring(0, () => {
    if (!running || running.spring !== spring) return;
    render(plan, spring.value);

    if (spring.resting || isSettled(spring, 1)) finish();
  });

  running = { plan, spring };
  spring.to(1, SPRING);
}
