import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createSegmentedControl } from "vitrium";
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

const markup = (label: ReactNode) => renderToStaticMarkup(<>{label}</>);

// A React wrapper around Vitrium's segmented control. The control adopts its
// items from the host, so they are built as static markup (labels hold no
// handlers) and refreshed in place when the labels change, e.g. on a language switch.
export function SegmentedControl({
  value,
  options,
  onSelect,
  ref,
  ...attributes
}: SegmentedControlProps) {
  const root = useRef<HTMLDivElement>(null);
  const control = useRef<ReturnType<typeof createSegmentedControl> | null>(null);
  const current = useRef({ value, options, onSelect });

  useLayoutEffect(() => {
    current.current = { value, options, onSelect };
  });
  useImperativeHandle(ref, () => ({ refresh: (config) => control.current?.refresh(config) }), []);
  useLayoutEffect(() => {
    if (!root.current) return;

    const host = root.current;

    host.replaceChildren(
      ...current.current.options.flatMap((option) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "lg-seg__item";
        button.dataset.value = option.value;
        button.innerHTML = markup(option.label);

        if (!option.separator) return [button];

        const separator = document.createElement("div");

        separator.className = "lg-seg__separator";

        return [separator, button];
      }),
    );

    control.current = createSegmentedControl(host, {
      value: current.current.value,
      onSelect: (next: string, { silent }: { silent: boolean }) => {
        if (!silent) current.current.onSelect(next);
      },
    });

    return () => {
      control.current?.destroy();
      control.current = null;
      host.replaceChildren();
    };
  }, []);
  useLayoutEffect(() => {
    const host = root.current;

    if (!host || !control.current) return;

    let changed = false;

    for (const option of options) {
      const cell = host.querySelector<HTMLElement>(`.lg-seg__item[data-value="${option.value}"]`);
      const html = markup(option.label);

      if (cell && cell.innerHTML !== html) {
        cell.innerHTML = html;
        changed = true;
      }
    }

    if (control.current.value !== value) control.current.select(value);

    if (changed) control.current.refresh({ snap: true });
  }, [value, options]);

  return <div {...attributes} ref={root} />;
}
