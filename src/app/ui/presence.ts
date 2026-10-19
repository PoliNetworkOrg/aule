import { useEffect, useState } from "react";

/** The close duration (`duration-150`): the longest an exit takes to play. */
export const EXIT_MS = 150;

/**
 * Keeps something mounted while its exit transition plays. Render it while
 * `mounted`, and give it its exit classes while `leaving`; the enter side is
 * `starting:` classes on the element itself. The exit duration must match the
 * element's `duration-*` (EXIT_MS for the usual `duration-150`).
 */
export function usePresence(present: boolean, exit = EXIT_MS) {
  const [mounted, setMounted] = useState(present);

  if (present && !mounted) setMounted(true);

  useEffect(() => {
    if (present || !mounted) return;

    const timer = window.setTimeout(() => setMounted(false), exit);

    return () => window.clearTimeout(timer);
  }, [present, mounted, exit]);

  return { mounted, leaving: mounted && !present };
}
