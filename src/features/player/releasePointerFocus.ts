import type { MouseEvent } from "react";

/**
 * For buttons that only seek (timestamps, skips). After a mouse or touch
 * click such a button would keep focus, and Space would press it again
 * instead of reaching the page's play/pause shortcut. Keyboard activation
 * (detail 0) keeps focus, so keyboard users don't lose their place.
 */
export function releasePointerFocus(event: MouseEvent<HTMLElement>): void {
  if (event.detail > 0) event.currentTarget.blur();
}
