import type { Meeting } from "@shared/schemas";
import { formatDateTime, formatTimestamp } from "@/lib/time";
import { groupByOwner } from "./actionItemState";
import { parseRichText } from "./RichText";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

function richHtml(text: string): string {
  return parseRichText(text)
    .map((span) =>
      span.bold
        ? `<strong>${escapeHtml(span.text)}</strong>`
        : escapeHtml(span.text),
    )
    .join("");
}

const moment = (seconds: number | null) =>
  seconds === null ? "" : ` (${formatTimestamp(seconds)})`;

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string; label?: string }
  | { kind: "list"; items: { text: string; children: string[] }[] };

function blocks(meeting: Meeting): Block[] {
  const out: Block[] = [
    { kind: "heading", level: 1, text: meeting.title },
    { kind: "paragraph", text: formatDateTime(new Date(meeting.createdAt)) },
  ];
  const summary = meeting.summary;
  if (!summary) return out;

  if (summary.overview) {
    out.push({ kind: "paragraph", text: summary.overview });
  }
  if (summary.keywords.length > 0) {
    out.push({
      kind: "paragraph",
      label: "Keywords:",
      text: summary.keywords.join(", "),
    });
  }
  if (summary.notes.length > 0) {
    out.push({ kind: "heading", level: 2, text: "Notes" });
    for (const section of summary.notes) {
      out.push({
        kind: "heading",
        level: 3,
        text: `${section.heading}${moment(section.startSecond)}`,
      });
      if (section.gist) out.push({ kind: "paragraph", text: section.gist });
      if (section.points.length > 0) {
        out.push({
          kind: "list",
          items: section.points.map((point) => ({
            text: `${point.text}${moment(point.startSecond)}`,
            children: point.details,
          })),
        });
      }
    }
  }
  const groups = groupByOwner(summary.actionItems);
  if (groups.length > 0) {
    out.push({ kind: "heading", level: 2, text: "Action items" });
    for (const group of groups) {
      out.push({
        kind: "heading",
        level: 3,
        text: group.owner ?? "Unassigned",
      });
      out.push({
        kind: "list",
        items: group.entries.map(({ item }) => ({
          text: `${item.task}${item.due ? `, due ${item.due}` : ""}${moment(item.startSecond)}`,
          children: [],
        })),
      });
    }
  }
  const lists: [string, readonly string[]][] = [
    ["Decisions", summary.decisions],
  ];
  if (summary.notes.length === 0) {
    lists.push(["Key takeaways", summary.keyTakeaways]);
  }
  for (const [title, items] of lists) {
    if (items.length === 0) continue;
    out.push({ kind: "heading", level: 2, text: title });
    out.push({
      kind: "list",
      items: items.map((text) => ({ text, children: [] })),
    });
  }
  return out;
}

function toMarkdown(block: Block): string {
  switch (block.kind) {
    case "heading":
      return `${"#".repeat(block.level)} ${block.text}`;
    case "paragraph":
      return block.label ? `${block.label} ${block.text}` : block.text;
    case "list":
      return block.items
        .flatMap((item) => [
          `- ${item.text}`,
          ...item.children.map((child) => `  - ${child}`),
        ])
        .join("\n");
  }
}

function toHtml(block: Block): string {
  switch (block.kind) {
    case "heading":
      return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
    case "paragraph":
      return block.label
        ? `<p><strong>${escapeHtml(block.label)}</strong> ${escapeHtml(block.text)}</p>`
        : `<p>${escapeHtml(block.text)}</p>`;
    case "list":
      return `<ul>${block.items
        .map((item) => {
          const children =
            item.children.length > 0
              ? `<ul>${item.children.map((child) => `<li>${richHtml(child)}</li>`).join("")}</ul>`
              : "";
          return `<li>${richHtml(item.text)}${children}</li>`;
        })
        .join("")}</ul>`;
  }
}

export function notesToClipboard(meeting: Meeting): {
  html: string;
  markdown: string;
} {
  const parts = blocks(meeting);
  return {
    html: parts.map(toHtml).join("\n"),
    markdown: `${parts.map(toMarkdown).join("\n\n")}\n`,
  };
}
