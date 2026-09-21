import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";
import { createToggle } from "vitrium";

export interface PillControl {
  refresh: (options?: { snap?: boolean }) => void;
}

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  ref?: Ref<PillControl>;
}

// A React wrapper around Vitrium's toggle: the switch is built imperatively and
// mounted into a layout-neutral host.
export function Toggle({ value, onChange, ref }: ToggleProps) {
  const host = useRef<HTMLSpanElement>(null);
  const toggle = useRef<ReturnType<typeof createToggle> | null>(null);
  const change = useRef(onChange);
  const initial = useRef(value);

  useLayoutEffect(() => {
    change.current = onChange;
  });
  useImperativeHandle(ref, () => ({ refresh: (options) => toggle.current?.refresh(options) }), []);
  useLayoutEffect(() => {
    if (!host.current) return;

    const created = createToggle({
      value: initial.current,
      onChange: (next: boolean) => change.current(next),
    });

    toggle.current = created;
    host.current.append(created.el);

    return () => {
      created.destroy();
      created.el.remove();
      toggle.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    if (toggle.current && toggle.current.on !== value) toggle.current.set(value);
  }, [value]);

  return <span ref={host} className="contents" />;
}
