import { describe, expect, it } from "vitest";
import { formatDateTime } from "@/lib/time";
import { meetingFixture } from "@/test/fixtures";
import { notesToClipboard } from "./notesToClipboard";

const meeting = meetingFixture({
  summary: {
    ...(meetingFixture().summary as NonNullable<
      ReturnType<typeof meetingFixture>["summary"]
    >),
    actionItems: [
      { task: "Send the invite", owner: null, due: null, startSecond: null },
      { task: "Tag the release", owner: "Ana", due: "Friday", startSecond: 70 },
    ],
  },
});
const date = formatDateTime(new Date(meeting.createdAt));

describe("notesToClipboard", () => {
  it("writes the notes as markdown", () => {
    expect(notesToClipboard(meeting).markdown).toBe(
      [
        "# Weekly sync",
        "",
        date,
        "",
        "The team agreed to ship the release on Friday.",
        "",
        "Keywords: release, Friday",
        "",
        "## Notes",
        "",
        "### Release timeline (00:00)",
        "",
        "The team set the release date.",
        "",
        "- The team will **ship on Friday** (00:00)",
        "  - QA signs off on Thursday",
        "",
        "### Release tasks (01:10)",
        "",
        "Ana takes the release work.",
        "",
        "- **Ana** tags the release (01:10)",
        "",
        "## Action items",
        "",
        "### Ana",
        "",
        "- Tag the release, due Friday (01:10)",
        "",
        "### Unassigned",
        "",
        "- Send the invite",
        "",
        "## Decisions",
        "",
        "- Ship on Friday",
        "",
      ].join("\n"),
    );
  });

  it("writes the same structure as HTML", () => {
    const { html } = notesToClipboard(meeting);

    expect(html).toBe(
      [
        "<h1>Weekly sync</h1>",
        `<p>${date}</p>`,
        "<p>The team agreed to ship the release on Friday.</p>",
        "<p><strong>Keywords:</strong> release, Friday</p>",
        "<h2>Notes</h2>",
        "<h3>Release timeline (00:00)</h3>",
        "<p>The team set the release date.</p>",
        "<ul><li>The team will <strong>ship on Friday</strong> (00:00)<ul><li>QA signs off on Thursday</li></ul></li></ul>",
        "<h3>Release tasks (01:10)</h3>",
        "<p>Ana takes the release work.</p>",
        "<ul><li><strong>Ana</strong> tags the release (01:10)</li></ul>",
        "<h2>Action items</h2>",
        "<h3>Ana</h3>",
        "<ul><li>Tag the release, due Friday (01:10)</li></ul>",
        "<h3>Unassigned</h3>",
        "<ul><li>Send the invite</li></ul>",
        "<h2>Decisions</h2>",
        "<ul><li>Ship on Friday</li></ul>",
      ].join("\n"),
    );
  });

  it("keeps key takeaways only for legacy summaries", () => {
    const summary = meeting.summary as NonNullable<typeof meeting.summary>;
    const v2 = notesToClipboard(meeting);
    expect(v2.markdown).not.toContain("Key takeaways");
    expect(v2.html).not.toContain("Key takeaways");

    const legacy = notesToClipboard(
      meetingFixture({ summary: { ...summary, notes: [] } }),
    );
    expect(legacy.markdown).toContain(
      [
        "## Decisions",
        "",
        "- Ship on Friday",
        "",
        "## Key takeaways",
        "",
        "- Release is on track",
        "",
      ].join("\n"),
    );
    expect(legacy.html).toContain(
      "<h2>Key takeaways</h2>\n<ul><li>Release is on track</li></ul>",
    );
  });

  it("escapes HTML from the title and model output", () => {
    const { html } = notesToClipboard(
      meetingFixture({
        title: `<script>alert("x")</script>`,
        summary: {
          title: "x",
          overview: "Tom & Jerry's <b>plan</b>",
          keywords: [],
          notes: [
            {
              heading: "A <i>heading</i>",
              gist: "",
              startSecond: null,
              points: [
                {
                  text: "**<img src=x>** & more",
                  startSecond: null,
                  details: [],
                },
              ],
            },
          ],
          keyTakeaways: [],
          decisions: [],
          actionItems: [],
        },
      }),
    );

    expect(html).toContain(
      "<h1>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</h1>",
    );
    expect(html).toContain(
      "<p>Tom &amp; Jerry&#39;s &lt;b&gt;plan&lt;/b&gt;</p>",
    );
    expect(html).toContain("<h3>A &lt;i&gt;heading&lt;/i&gt;</h3>");
    expect(html).toContain(
      "<li><strong>&lt;img src=x&gt;</strong> &amp; more</li>",
    );
    expect(html).not.toContain("<img");
  });

  it("leaves out empty parts and missing moments", () => {
    const { markdown, html } = notesToClipboard(
      meetingFixture({
        summary: {
          title: "Short",
          overview: "A short check-in.",
          keywords: [],
          notes: [],
          keyTakeaways: [],
          decisions: [],
          actionItems: [],
        },
      }),
    );

    expect(markdown).toBe(
      ["# Weekly sync", "", date, "", "A short check-in.", ""].join("\n"),
    );
    expect(html).not.toContain("<h2>");
  });

  it("copies only the title and date before the notes exist", () => {
    const { markdown } = notesToClipboard(meetingFixture({ summary: null }));

    expect(markdown).toBe(["# Weekly sync", "", date, ""].join("\n"));
  });
});
