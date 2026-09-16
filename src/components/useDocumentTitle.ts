import { useEffect } from "react";

export const APP_TITLE = "Recap";

// A React 19 `<title>` would lose to index.html's, which comes first in <head>.
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
    return () => {
      document.title = APP_TITLE;
    };
  }, [title]);
}
