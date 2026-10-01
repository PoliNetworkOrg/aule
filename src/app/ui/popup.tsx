import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { t, useLocale } from "../i18n";
import { IconButton } from "./button";
import { insetFocus } from "./focus";
import { Icon } from "./icon";
import { pressable } from "./motion";

// One primitive for every picker: a panel anchored under its trigger on
// desktop, a bottom sheet on phones. Escape, a click outside or the close
// button dismiss it; focus moves into the panel and back to the trigger.

const sheetQuery = matchMedia("(max-width: 639px)");

interface Position {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  /** Which edge faces the trigger: the panel grows out of it when it opens. */
  origin: "top" | "bottom";
}

function useIsSheet() {
  const [sheet, setSheet] = useState(sheetQuery.matches);

  useEffect(() => {
    const update = () => setSheet(sheetQuery.matches);

    sheetQuery.addEventListener("change", update);

    return () => sheetQuery.removeEventListener("change", update);
  }, []);

  return sheet;
}

const MAX_POPUP_HEIGHT = 560;

/** Below the trigger when the panel fits there, else above, else on the roomier side. */
function anchorPosition(anchor: HTMLElement, minWidth: number, contentHeight: number): Position {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, minWidth), innerWidth - 16);
  const left = Math.min(Math.max(8, rect.left), innerWidth - width - 8);
  const below = innerHeight - rect.bottom - 16;
  const above = rect.top - 16;
  const wanted = Math.min(contentHeight, MAX_POPUP_HEIGHT);

  if (wanted <= below || (wanted > above && below >= above))
    return { top: rect.bottom + 6, left, width, maxHeight: Math.min(wanted, below), origin: "top" };

  const height = Math.min(wanted, above);

  return { top: rect.top - 6 - height, left, width, maxHeight: height, origin: "bottom" };
}

export function Popup({
  open,
  anchor,
  title,
  onClose,
  minWidth = 260,
  children,
}: {
  open: boolean;
  anchor: RefObject<HTMLElement | null>;
  title: string;
  onClose: () => void;
  minWidth?: number;
  children: ReactNode;
}) {
  useLocale();
  const sheet = useIsSheet();
  const panel = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    if (!open || sheet || !anchor.current) return;

    const target = anchor.current;

    const update = () => {
      const content = (header.current?.offsetHeight ?? 0) + (body.current?.scrollHeight ?? 0) + 2;

      setPosition(anchorPosition(target, minWidth, content));
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, sheet, anchor, minWidth]);

  useEffect(() => {
    if (!open) return;

    const trigger = anchor.current;

    const selected = panel.current?.querySelector<HTMLElement>(
      "[aria-pressed='true'], [aria-selected='true']",
    );

    const first = panel.current?.querySelector<HTMLElement>("button:not(:disabled)");

    (selected ?? first)?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: "center" });

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("keydown", onKey, true);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      trigger?.focus({ preventScroll: true });
    };
  }, [open, anchor, onClose]);

  if (!open) return null;

  const style =
    sheet || !position
      ? undefined
      : {
          top: position.top,
          left: position.left,
          width: position.width,
          maxHeight: position.maxHeight,
          transformOrigin: `${position.origin} center`,
        };

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className={cn(
          "absolute inset-0",
          sheet && "bg-scrim/40 transition-opacity duration-150 ease-smooth-out starting:opacity-0",
        )}
        onClick={onClose}
      />
      <div
        ref={panel}
        className={cn(
          "fixed flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-md",
          // Closing (unmount) is instant, as closes should get out of the way.
          "duration-250 ease-smooth-out starting:opacity-0",
          sheet
            ? // Rises a short way rather than the full sheet height: a nudge, not a drawer.
              "right-0 bottom-0 left-0 max-h-[80dvh] rounded-t-xl rounded-b-none border-b-0 pb-[env(safe-area-inset-bottom)] transition-[opacity,translate] starting:translate-y-2"
            : // Fades and grows out of its trigger's edge (transformOrigin, below).
              "transition-[opacity,scale] starting:scale-97",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={style}
      >
        <div
          ref={header}
          className="flex items-center justify-between gap-2 pt-2.5 pr-2.5 pb-1.5 pl-4"
        >
          <span className="text-15 font-bold">{title}</span>
          <IconButton size="small" aria-label={t("common.close")} onClick={onClose}>
            <Icon name="cancel-01" />
          </IconButton>
        </div>
        <div ref={body} className="overflow-y-auto overscroll-contain px-4 pt-1 pb-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export interface MenuOption {
  value: string;
  label: string;
  description?: string;
}

export interface MenuGroup {
  label?: string;
  options: MenuOption[];
}

/** A single-choice list inside a Popup (campus, building…). */
export function OptionList({
  groups,
  value,
  onSelect,
}: {
  groups: MenuGroup[];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group, index) => (
        <div
          key={group.label ?? index}
          className="flex flex-col gap-0.5"
          role="group"
          aria-label={group.label}
        >
          {group.label && (
            <p className="px-2.5 pb-1 text-11 font-bold tracking-widest text-subtle uppercase">
              {group.label}
            </p>
          )}
          {group.options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-[background-color,scale]",
                pressable,
                "hover:bg-surface-muted aria-pressed:bg-accent-soft aria-pressed:text-accent-strong",
                insetFocus,
              )}
              aria-pressed={option.value === value}
              onClick={() => onSelect(option.value)}
            >
              <span className="flex flex-col">
                <span className="font-semibold">{option.label}</span>
                {option.description && (
                  <span className="text-13 text-muted">{option.description}</span>
                )}
              </span>
              {option.value === value && (
                <Icon name="tick-02" className="ml-auto text-18 text-accent" />
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
