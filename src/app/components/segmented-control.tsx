import {
  Fragment,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { createPillDragCore } from "./pill-drag-core";
import type { PillControl } from "./toggle";

interface Segment {
  value: string;
  label: ReactNode;
  separator?: boolean;
}

interface SegmentedControlProps extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> {
  value: string;
  options: Segment[];
  onSelect: (value: string) => void;
  ref?: Ref<PillControl>;
}

export function SegmentedControl({
  value,
  options,
  onSelect,
  ref,
  ...attributes
}: SegmentedControlProps) {
  const root = useRef<HTMLDivElement>(null);
  const items = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const hit = useRef<HTMLDivElement>(null);
  const activeRow = useRef<HTMLDivElement>(null);
  const core = useRef<ReturnType<typeof createPillDragCore> | null>(null);
  const labels = useRef("");
  const current = useRef({ value, options, onSelect });

  useLayoutEffect(() => {
    current.current = { value, options, onSelect };
  });
  useImperativeHandle(ref, () => ({ refresh: (config) => core.current?.refresh(config) }), []);
  useLayoutEffect(() => {
    if (!root.current || !items.current || !pill.current || !hit.current || !activeRow.current)
      return;

    const drag = createPillDragCore({
      root: root.current,
      items: items.current,
      pill: pill.current,
      hit: hit.current,
      activeRow: activeRow.current,
      cellSelector: ".seg-item",
      liftedClass: "seg-pill--lifted",
      onChange(index, { silent }) {
        if (!silent) current.current.onSelect(current.current.options[index].value);
      },
    });

    core.current = drag;
    const observer = new ResizeObserver(() => drag.refresh());
    observer.observe(root.current);
    drag.select(
      current.current.options.findIndex((option) => option.value === current.current.value),
      {
        animate: false,
        silent: true,
      },
    );

    return () => {
      observer.disconnect();
      drag.destroy();
      core.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    const text = activeRow.current?.textContent ?? "";

    if (labels.current !== text) {
      labels.current = text;
      core.current?.refresh({ snap: true });
    }

    const index = options.findIndex((option) => option.value === value);

    if (core.current?.index !== index)
      core.current?.select(index, { animate: false, silent: true });
  }, [value, options]);

  return (
    <div {...attributes} ref={root} className="seg" role="radiogroup">
      <div className="seg-track">
        <div ref={items} className="seg-items">
          {options.map((option) => (
            <Fragment key={option.value}>
              {option.separator && <div className="seg-separator" />}
              <button
                className={`seg-item${option.value === value ? " active" : ""}`}
                data-value={option.value}
                role="radio"
                aria-checked={option.value === value}
                tabIndex={option.value === value ? 0 : -1}
              >
                {option.label}
              </button>
            </Fragment>
          ))}
        </div>
      </div>
      <div ref={pill} className="seg-pill">
        <div className="seg-pill-inner">
          <div ref={activeRow} className="seg-active-row">
            {options.map((option) => (
              <span key={option.value} className="seg-active-cell">
                {option.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div ref={hit} className="seg-hit" />
    </div>
  );
}
