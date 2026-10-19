import { usePageLoading } from "../../lib/navigation";
import { cn } from "../../lib/cn";
import { t, useLocale } from "../i18n";
import { usePresence } from "./presence";

/** A centred spinner while the next page's code loads, so a slow tap still shows progress. */
export function PageLoading() {
  useLocale();

  const { mounted, leaving } = usePresence(usePageLoading());

  if (!mounted) return null;

  return (
    <div
      role="status"
      aria-label={t("common.loading")}
      className={cn(
        "pointer-events-none fixed inset-0 z-40 grid place-items-center transition-opacity duration-150 ease-smooth-out starting:opacity-0",
        leaving && "opacity-0",
      )}
    >
      <span className="size-8 animate-spin rounded-full border-[3px] border-border-strong border-t-accent" />
    </div>
  );
}
