import { del, get, issueSignedToken, presignUrl } from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { blobStorage } from "./blobStorage.js";

vi.mock("@vercel/blob", () => ({
  get: vi.fn(),
  del: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
}));

const T0 = new Date("2026-09-16T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

const mockedGet = vi.mocked(get);

type GetResult = Awaited<ReturnType<typeof get>>;

describe("blobStorage", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    vi.mocked(del).mockReset();
    vi.mocked(issueSignedToken).mockReset();
    vi.mocked(presignUrl).mockReset();
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

  describe("audioUrl", () => {
    const token = {
      delegationToken: "delegation",
      clientSigningToken: "signing",
      validUntil: T0.getTime() + HOUR_MS,
    };
    const presignedUrl =
      "https://store.private.blob.vercel-storage.com/recordings/a.webm?vercel-blob-signature=abc";

    it("presigns a private GET url that is valid for an hour", async () => {
      vi.mocked(issueSignedToken).mockResolvedValue(token);
      vi.mocked(presignUrl).mockResolvedValue({ presignedUrl });

      const result = await blobStorage(() => T0).audioUrl("recordings/a.webm");

      expect(issueSignedToken).toHaveBeenCalledExactlyOnceWith({
        pathname: "recordings/a.webm",
        operations: ["get"],
        validUntil: T0.getTime() + HOUR_MS,
      });
      expect(presignUrl).toHaveBeenCalledExactlyOnceWith(token, {
        operation: "get",
        pathname: "recordings/a.webm",
        access: "private",
      });
      expect(result).toEqual({
        url: presignedUrl,
        expiresAt: "2026-09-16T13:00:00.000Z",
      });
    });

    it("reports the expiry the Blob API granted", async () => {
      vi.mocked(issueSignedToken).mockResolvedValue({
        ...token,
        validUntil: T0.getTime() + 30 * 60 * 1000,
      });
      vi.mocked(presignUrl).mockResolvedValue({ presignedUrl });

      const { expiresAt } = await blobStorage(() => T0).audioUrl(
        "recordings/a.webm",
      );

      expect(expiresAt).toBe("2026-09-16T12:30:00.000Z");
    });

    it("lets a failing token request surface as is", async () => {
      vi.mocked(issueSignedToken).mockRejectedValue(new Error("blob down"));

      await expect(
        blobStorage(() => T0).audioUrl("recordings/a.webm"),
      ).rejects.toThrow("blob down");
      expect(presignUrl).not.toHaveBeenCalled();
    });
  });
});
