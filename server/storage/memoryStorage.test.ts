import { describe, expect, it } from "vitest";
import { audioUrlSchema } from "../../shared/schemas.js";
import { memoryStorage } from "./memoryStorage.js";

const T0 = new Date("2026-09-16T12:00:00.000Z");
const audio = { bytes: new Uint8Array([1, 2, 3]), contentType: "audio/webm" };

describe("memoryStorage", () => {
  it("reads back what was put and forgets it after delete", async () => {
    const storage = memoryStorage();
    storage.put("recordings/a.webm", audio);

    await expect(storage.readAudio("recordings/a.webm")).resolves.toEqual(
      audio,
    );
    await storage.delete("recordings/a.webm");
    await expect(storage.readAudio("recordings/a.webm")).rejects.toMatchObject({
      status: 404,
      code: "audio_missing",
    });
  });

  it("hands out a fake url that expires in an hour", async () => {
    const storage = memoryStorage(() => T0);
    storage.put("recordings/a.webm", audio);

    const result = await storage.audioUrl("recordings/a.webm");

    expect(result).toEqual({
      url: "https://memory.test/recordings/a.webm",
      expiresAt: "2026-09-16T13:00:00.000Z",
    });
    expect(audioUrlSchema.safeParse(result).success).toBe(true);
  });

  it("refuses a url for audio it does not have", async () => {
    const storage = memoryStorage(() => T0);

    await expect(
      storage.audioUrl("recordings/missing.webm"),
    ).rejects.toMatchObject({
      status: 404,
      code: "audio_missing",
      retryable: false,
    });
  });
});
