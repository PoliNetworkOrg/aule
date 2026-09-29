import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { t, useLocale } from "../i18n";
import { Icon } from "./icon";

// One primitive for every picker: a panel anchored under its trigger on
// desktop, a bottom sheet on phones. Escape, a click outside or the close
// button dismiss it; focus moves into the panel and back to the trigger.

const sheetQuery = matchMedia("(max-width: 639px)");

interface Position {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
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
    return { top: rect.bottom + 6, left, width, maxHeight: Math.min(wanted, below) };

  const height = Math.min(wanted, above);

  return { top: rect.top - 6 - height, left, width, maxHeight: height };
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
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    if (!open || sheet || !anchor.current) return;

    const target = anchor.current;

    const update = () => {
      const header = panel.current?.querySelector<HTMLElement>(".popup__header");
      const body = panel.current?.querySelector<HTMLElement>(".popup__body");
      const content = (header?.offsetHeight ?? 0) + (body?.scrollHeight ?? 0) + 2;

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
        };

  return createPortal(
    <div className={`popup-layer${sheet ? " popup-layer--sheet" : ""}`}>
      <div className="popup-backdrop" onClick={onClose} />
      <div
        ref={panel}
        className={`popup${sheet ? " popup--sheet" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={style}
      >
        <div className="popup__header">
          <span className="popup__title">{title}</span>
          <button
            type="button"
            className="icon-button icon-button--small"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <Icon name="cancel-01" />
          </button>
        </div>
        <div className="popup__body">{children}</div>
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
    <div className="option-list">
      {groups.map((group, index) => (
        <div
          key={group.label ?? index}
          className="option-list__group"
          role="group"
          aria-label={group.label}
        >
          {group.label && <p className="option-list__label">{group.label}</p>}
          {group.options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="option"
              aria-pressed={option.value === value}
              onClick={() => onSelect(option.value)}
            >
              <span className="option__text">
                <span className="option__label">{option.label}</span>
                {option.description && (
                  <span className="option__description">{option.description}</span>
                )}
              </span>
              {option.value === value && <Icon name="tick-02" className="option__check" />}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
