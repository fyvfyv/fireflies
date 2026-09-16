import { useEffect, useState } from "react";

const CHECK_MS = 60_000;

/**
 * The current time, replaced once the local day changes, so "Today" and
 * today's times don't go stale on a page left open overnight. A minute check
 * rather than one timer for midnight: timers pause while a laptop sleeps, so
 * that timer could fire hours after the day changed.
 */
export function useToday(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      const current = new Date();
      // Same day keeps the old value, so nothing re-renders.
      setNow((prev) =>
        prev.toDateString() === current.toDateString() ? prev : current,
      );
    }, CHECK_MS);
    return () => clearInterval(timer);
  }, []);

  return now;
}
