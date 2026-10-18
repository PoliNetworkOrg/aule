import { useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { usePresence } from "./presence";

/**
 * Something that comes and goes in the flow of the page: opens by height and
 * fades, so what's around it glides instead of jumping. Closes quicker than it
 * opens, and keeps its last content on screen while it folds away.
 */
export function Reveal({
  show,
  className,
  children,
}: {
  show: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { mounted, leaving } = usePresence(show);
  const [kept, setKept] = useState(children);

  if (show && kept !== children) setKept(children);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-250 ease-smooth-out",
        "starting:grid-rows-[0fr] starting:opacity-0",
        leaving && "grid-rows-[0fr] opacity-0 duration-150",
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden">{kept}</div>
    </div>
  );
}
