import type { MouseEvent } from "react";

/** A clicked seek-only button would keep focus and swallow Space; keyboard activation (detail 0) keeps it. */
export function releasePointerFocus(event: MouseEvent<HTMLElement>): void {
  if (event.detail > 0) event.currentTarget.blur();
}
