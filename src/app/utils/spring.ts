// Minimal spring-physics engine shared by every draggable "sliding pill" UI
// (bottom-nav's tab pill, the date-picker's day indicator). Extracted from
// the DormMate case-study's PanResponder-driven pill tab bar.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const springs = new Set<Spring>();

const renderers = new Set<() => void>();

let rafId: number | null = null;

let lastT = 0;

function loop(t: number) {
  const dt = Math.min((t - lastT) / 1000, 0.064);
  lastT = t;
  let busy = false;

  for (const s of springs) if (s.step(dt)) busy = true;

  for (const r of renderers) r();
  rafId = busy ? requestAnimationFrame(loop) : null;
}

function wake() {
  if (rafId == null) {
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  }
}

export class Spring {
  value: number;
  v: number;
  target: number;
  k: number;
  c: number;
  m: number;
  resting: boolean;
  constructor(value = 0) {
    this.value = value;
    this.v = 0;
    this.target = value;
    this.k = 300;
    this.c = 30;
    this.m = 1;
    this.resting = true;
    springs.add(this);
  }
  to(target: number, { stiffness = 300, damping = 30, mass = 1 } = {}) {
    if (reducedMotion) return this.set(target);
    this.target = target;
    this.k = stiffness;
    this.c = damping;
    this.m = mass;
    this.resting = false;
    wake();
  }
  set(value: number) {
    this.value = value;
    this.target = value;
    this.v = 0;
    this.resting = true;
    wake();
  }
  stop() {
    this.target = this.value;
    this.v = 0;
    this.resting = true;
  }
  destroy() {
    this.stop();
    springs.delete(this);
  }
  step(dt: number) {
    if (this.resting) return false;
    const n = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / n;

    for (let i = 0; i < n; i++) {
      const F = -this.k * (this.value - this.target) - this.c * this.v;
      this.v += (F / this.m) * h;
      this.value += this.v * h;
    }

    if (Math.abs(this.v) < 0.05 && Math.abs(this.value - this.target) < 0.05) {
      this.value = this.target;
      this.v = 0;
      this.resting = true;
    }

    return !this.resting;
  }
}

// Registers a per-frame render callback, run alongside every spring's step()
// while any spring in the whole module is active (there's one shared RAF
// loop, not one per consumer).
export function onSpringFrame(fn: () => void) {
  renderers.add(fn);

  return () => renderers.delete(fn);
}

export function wakeSprings() {
  wake();
}
