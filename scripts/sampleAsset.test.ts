import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sampleFile = new URL("../public/samples/standup.webm", import.meta.url);

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];
const MAX_SAMPLE_BYTES = 1024 * 1024;

describe("sample recording", () => {
  it("is a WebM file of at most 1 MiB", async () => {
    const bytes = await readFile(sampleFile);

    expect([...bytes.subarray(0, 4)]).toEqual(EBML_MAGIC);
    expect(bytes.subarray(0, 64).toString("latin1")).toContain("webm");
    expect(bytes.byteLength).toBeLessThanOrEqual(MAX_SAMPLE_BYTES);
  });
});
