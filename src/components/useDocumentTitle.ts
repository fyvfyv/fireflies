import { useEffect } from "react";

export const APP_TITLE = "Recap";

/**
 * Sets the tab title while the calling page is mounted. A React 19 `<title>`
 * element would not work here: index.html's static `<title>` comes first in
 * `<head>`, and `document.title` reads the first one.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
    return () => {
      document.title = APP_TITLE;
    };
  }, [title]);
}
