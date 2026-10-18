import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { formatRomeYYYYMMDD } from "../available-rooms-script";
import { t } from "../i18n";
import { useStore } from "../state/store";
import { IconButton } from "../ui/button";
import { Icon } from "../ui/icon";

/** Hover previews the warning; clicking or tapping keeps it open until dismissed. */
export function StaleDataWarning() {
  const generatedAt = useStore((state) => state.generatedAt);
  const occupancy = useStore((state) => state.occupancy);
  const [display, setDisplay] = useState<"closed" | "hover" | "pinned">("closed");
  const container = useRef<HTMLDivElement>(null);
  const id = useId();

  const stale =
    occupancy !== "error" &&
    !!generatedAt &&
    formatRomeYYYYMMDD(generatedAt) !== formatRomeYYYYMMDD(new Date());

  const open = stale && display !== "closed";

  useEffect(() => {
    if (!open) return;

    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) {
        setDisplay("closed");
      }
    }

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setDisplay("closed");
    }

    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);

    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  if (!stale) return null;

  return (
    <div
      ref={container}
      className="shrink-0"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          setDisplay((current) => (current === "closed" ? "hover" : current));
        }
      }}
      onPointerLeave={() => setDisplay((current) => (current === "hover" ? "closed" : current))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDisplay("closed");
      }}
    >
      <IconButton
        className="text-partial hover:bg-partial-soft hover:text-partial"
        aria-label={t("data.stale")}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-describedby={open ? id : undefined}
        onClick={() => setDisplay((current) => (current === "pinned" ? "closed" : "pinned"))}
      >
        <Icon name="alert-02" />
      </IconButton>
      {open && (
        <div
          id={id}
          role="note"
          className="absolute top-full right-gutter z-3 w-80 max-w-[calc(100vw-2rem)] pt-2 lg:right-5"
        >
          <p
            className={cn(
              "rounded-md border border-partial-border bg-surface px-3 py-2.5 text-14 text-partial shadow-md",
              // Grows out of the button's corner; closing is instant, like a tooltip.
              "origin-top-right transition-[opacity,scale] duration-150 ease-smooth-out starting:scale-98 starting:opacity-0",
            )}
          >
            {t("data.stale")}
          </p>
        </div>
      )}
    </div>
  );
}
