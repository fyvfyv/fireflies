/**
 * Copies plain text. The async clipboard API only exists in secure contexts
 * (a LAN address over http has none), so the legacy copy command backs it up.
 */
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Permission refused or document not focused: try the legacy path.
  }
  legacyCopy(text);
}

/**
 * Copies HTML for rich editors (Docs, Notion, mail) together with a plain
 * text version for everything else. Browsers without ClipboardItem, or that
 * refuse a rich write, still get the plain text.
 */
export async function copyRich({
  html,
  text,
}: {
  html: string;
  text: string;
}): Promise<void> {
  if (typeof ClipboardItem === "function" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // Fall through to plain text.
    }
  }
  await copyText(text);
}

function legacyCopy(text: string) {
  const previous = document.activeElement;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  // Off screen but still selectable; display:none would make it uncopyable.
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "-9999px";
  document.body.append(area);
  area.focus();
  area.select();
  let copied = false;
  try {
    copied = document.execCommand?.("copy") ?? false;
  } finally {
    area.remove();
    if (previous instanceof HTMLElement) previous.focus();
  }
  if (!copied) throw new Error("The browser blocked clipboard access.");
}
