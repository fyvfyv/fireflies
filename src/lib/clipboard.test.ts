import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyRich, copyText } from "./clipboard";

type FakeClipboard = {
  writeText: ReturnType<typeof vi.fn>;
  write?: ReturnType<typeof vi.fn>;
};

function setClipboard(value: FakeClipboard | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
    writable: true,
  });
}

class FakeClipboardItem {
  constructor(readonly items: Record<string, Blob>) {}
}

let execCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
  execCommand = vi.fn(() => true);
  Object.defineProperty(document, "execCommand", {
    value: execCommand,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  setClipboard(undefined);
});

describe("copyText", () => {
  it("writes plain text through the async clipboard", async () => {
    const clipboard = { writeText: vi.fn(async () => {}) };
    setClipboard(clipboard);

    await copyText("Hello team");

    expect(clipboard.writeText).toHaveBeenCalledWith("Hello team");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("falls back to a hidden textarea without the clipboard API", async () => {
    setClipboard(undefined);
    let copied = "";
    execCommand.mockImplementation(() => {
      copied = (document.activeElement as HTMLTextAreaElement).value;
      return true;
    });

    await copyText("Hello team");

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(copied).toBe("Hello team");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back when the clipboard API refuses", async () => {
    setClipboard({
      writeText: vi.fn(async () => {
        throw new DOMException("Denied", "NotAllowedError");
      }),
    });

    await copyText("Hello team");

    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("rejects when nothing can copy", async () => {
    setClipboard(undefined);
    execCommand.mockReturnValue(false);

    await expect(copyText("Hello team")).rejects.toThrow();
  });
});

describe("copyRich", () => {
  it("writes HTML and plain text as one clipboard item", async () => {
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    const clipboard = {
      writeText: vi.fn(async () => {}),
      write: vi.fn(async (_items: FakeClipboardItem[]) => {}),
    };
    setClipboard(clipboard);

    await copyRich({ html: "<h1>Notes</h1>", text: "# Notes" });

    expect(clipboard.write).toHaveBeenCalledTimes(1);
    const [items] = clipboard.write.mock.calls[0] as [FakeClipboardItem[]];
    const item = items[0] as FakeClipboardItem;
    expect(Object.keys(item.items)).toEqual(["text/html", "text/plain"]);
    expect(await item.items["text/html"]?.text()).toBe("<h1>Notes</h1>");
    expect(await item.items["text/plain"]?.text()).toBe("# Notes");
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it("falls back to plain text without ClipboardItem", async () => {
    vi.stubGlobal("ClipboardItem", undefined);
    const clipboard = { writeText: vi.fn(async () => {}), write: vi.fn() };
    setClipboard(clipboard);

    await copyRich({ html: "<h1>Notes</h1>", text: "# Notes" });

    expect(clipboard.write).not.toHaveBeenCalled();
    expect(clipboard.writeText).toHaveBeenCalledWith("# Notes");
  });

  it("falls back to plain text when a rich write fails", async () => {
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    const clipboard = {
      writeText: vi.fn(async () => {}),
      write: vi.fn(async () => {
        throw new DOMException("Denied", "NotAllowedError");
      }),
    };
    setClipboard(clipboard);

    await copyRich({ html: "<h1>Notes</h1>", text: "# Notes" });

    expect(clipboard.writeText).toHaveBeenCalledWith("# Notes");
  });
});
