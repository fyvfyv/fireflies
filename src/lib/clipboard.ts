// The async clipboard API only exists in secure contexts (not LAN over http).
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {}
  legacyCopy(text);
}

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
    } catch {}
  }
  await copyText(text);
}

function legacyCopy(text: string) {
  const previous = document.activeElement;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  // Off screen rather than display:none, which would make it uncopyable.
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "-9999px";
  document.body.append(area);
  area.focus();
  area.select();
  let copied: boolean;
  try {
    copied = document.execCommand("copy");
  } finally {
    area.remove();
    if (previous instanceof HTMLElement) previous.focus();
  }
  if (!copied) throw new Error("The browser blocked clipboard access.");
}
