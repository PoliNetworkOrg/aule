import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";
import { createPillDragCore } from "./pill-drag-core";
import { haptics, defaultPatterns } from "./haptics";

export interface PillControl {
  refresh: (options?: { snap?: boolean }) => void;
}

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  ref?: Ref<PillControl>;
}

export function Toggle({ value, onChange, ref }: ToggleProps) {
  const root = useRef<HTMLButtonElement>(null);
  const items = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const hit = useRef<HTMLDivElement>(null);
  const activeRow = useRef<HTMLDivElement>(null);
  const core = useRef<ReturnType<typeof createPillDragCore> | null>(null);
  const change = useRef(onChange);
  const initial = useRef(value);

  useLayoutEffect(() => {
    change.current = onChange;
  });
  useImperativeHandle(ref, () => ({ refresh: (options) => core.current?.refresh(options) }), []);
  useLayoutEffect(() => {
    if (!root.current || !items.current || !pill.current || !hit.current || !activeRow.current)
      return;

    const drag = createPillDragCore({
      root: root.current,
      items: items.current,
      pill: pill.current,
      hit: hit.current,
      activeRow: activeRow.current,
      cellSelector: ".settings-toggle__cell",
      liftedClass: "seg-pill--lifted",
      onPillTap: () => drag.select(drag.index === 1 ? 0 : 1),
      onChange(index, { silent }) {
        if (silent) return;
        haptics.trigger(defaultPatterns.light);
        change.current(index === 1);
      },
    });

    core.current = drag;
    const observer = new ResizeObserver(() => drag.refresh());
    observer.observe(root.current);
    drag.select(initial.current ? 1 : 0, { animate: false, silent: true });

    return () => {
      observer.disconnect();
      drag.destroy();
      core.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    if (core.current?.index !== (value ? 1 : 0))
      core.current?.select(value ? 1 : 0, { silent: true });
  }, [value]);

  return (
    <button
      ref={root}
      type="button"
      className={`settings-toggle seg${value ? " on" : ""}`}
      role="switch"
      aria-checked={value}
      onClick={(event) => {
        if (event.target === event.currentTarget) core.current?.select(value ? 0 : 1);
      }}
    >
      <div ref={items} className="settings-toggle__items">
        <span className="settings-toggle__cell settings-toggle__cell--off" />
        <span className="settings-toggle__cell settings-toggle__cell--on" />
      </div>
      <div ref={pill} className="seg-pill settings-toggle__thumb">
        <div className="seg-pill-inner">
          <div ref={activeRow} className="seg-active-row">
            <span className="pill-active-cell" />
            <span className="pill-active-cell" />
          </div>
        </div>
      </div>
      <div ref={hit} className="seg-hit" />
    </button>
  );
}
