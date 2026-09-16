import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;

// The global reduced-motion CSS can't stop script-driven animation.
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
