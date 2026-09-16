import { useEffect, useState } from "react";

const CHECK_MS = 60_000;

// Polled rather than timed for midnight: timers pause while a laptop sleeps.
export function useToday(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      const current = new Date();
      setNow((prev) =>
        prev.toDateString() === current.toDateString() ? prev : current,
      );
    }, CHECK_MS);
    return () => clearInterval(timer);
  }, []);

  return now;
}
