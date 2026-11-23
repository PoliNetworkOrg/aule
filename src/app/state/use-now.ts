import { useEffect, useState } from "react";

/**
 * The current time, held in state and refreshed every `intervalMs`, so components
 * can compare against "now" without reading the clock during render.
 */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
