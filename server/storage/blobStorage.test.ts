import { del, get } from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { blobStorage } from "./blobStorage.js";

vi.mock("@vercel/blob", () => ({ get: vi.fn(), del: vi.fn() }));

const mockedGet = vi.mocked(get);

type GetResult = Awaited<ReturnType<typeof get>>;

describe("blobStorage", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    vi.mocked(del).mockReset();
  });

  it("reads a private blob's bytes and content type", async () => {
    mockedGet.mockResolvedValue({
      statusCode: 200,
      stream: new Blob([new Uint8Array([1, 2, 3])]).stream(),
      blob: { contentType: "audio/webm" },
    } as unknown as GetResult);

    const audio = await blobStorage().readAudio("recordings/a.webm");

    expect(mockedGet).toHaveBeenCalledWith("recordings/a.webm", {
      access: "private",
    });
    expect(audio).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "audio/webm",
    });
  });

  it.each([
    ["a missing blob", null],
    ["a non-200 answer", { statusCode: 304 }],
  ])("maps %s to a non-retryable audio_missing error", async (_, result) => {
    mockedGet.mockResolvedValue(result as unknown as GetResult);

    await expect(
      blobStorage().readAudio("recordings/a.webm"),
    ).rejects.toMatchObject({
      status: 404,
      code: "audio_missing",
      retryable: false,
    });
  });

  it("lets a failing read surface as is", async () => {
    mockedGet.mockRejectedValue(new Error("blob down"));

    await expect(blobStorage().readAudio("recordings/a.webm")).rejects.toThrow(
      "blob down",
    );
  });

  it("deletes by pathname and propagates failures", async () => {
    vi.mocked(del).mockRejectedValueOnce(new Error("blob down"));

    await expect(blobStorage().delete("recordings/a.webm")).rejects.toThrow(
      "blob down",
    );
    expect(del).toHaveBeenCalledWith("recordings/a.webm");
  });
});
