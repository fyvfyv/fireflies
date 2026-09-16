import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import { copyRich, copyText } from "./clipboard";

function setClipboard(value: object | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
    writable: true,
  });
}

const refuse = async () => {
  throw new DOMException("Denied", "NotAllowedError");
};

class FakeClipboardItem {
  constructor(readonly items: Record<string, Blob>) {}
}

let execCommand: Mock<(command: string) => boolean>;

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
  it("writes through the async clipboard", async () => {
    const writeText = vi.fn(async () => {});
    setClipboard({ writeText });

    await copyText("Hello team");

    expect(writeText).toHaveBeenCalledWith("Hello team");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it.each([
    ["is missing", undefined],
    ["refuses", { writeText: refuse }],
  ])(
    "falls back to a hidden textarea when the clipboard API %s",
    async (_, clipboard) => {
      setClipboard(clipboard);
      let copied = "";
      execCommand.mockImplementation(() => {
        copied = (document.activeElement as HTMLTextAreaElement).value;
        return true;
      });

      await copyText("Hello team");

      expect(execCommand).toHaveBeenCalledWith("copy");
      expect(copied).toBe("Hello team");
      expect(document.querySelector("textarea")).toBeNull();
    },
  );

  it("rejects when nothing can copy", async () => {
    setClipboard(undefined);
    execCommand.mockReturnValue(false);

    await expect(copyText("Hello team")).rejects.toThrow();
  });
});

describe("copyRich", () => {
  it("writes HTML and plain text as one clipboard item", async () => {
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    const write = vi.fn(async (_items: FakeClipboardItem[]) => {});
    setClipboard({ write });

    await copyRich({ html: "<h1>Notes</h1>", text: "# Notes" });

    const item = write.mock.calls[0]?.[0][0];
    expect(await item?.items["text/html"]?.text()).toBe("<h1>Notes</h1>");
    expect(await item?.items["text/plain"]?.text()).toBe("# Notes");
  });

  it.each([
    ["without ClipboardItem", undefined, async () => {}],
    ["when a rich write fails", FakeClipboardItem, refuse],
  ])("falls back to plain text %s", async (_, item, write) => {
    vi.stubGlobal("ClipboardItem", item);
    const writeText = vi.fn(async () => {});
    setClipboard({ writeText, write });

    await copyRich({ html: "<h1>Notes</h1>", text: "# Notes" });

    expect(writeText).toHaveBeenCalledWith("# Notes");
  });
});
