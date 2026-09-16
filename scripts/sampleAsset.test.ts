import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// TrySampleButton fetches this file and submits it as audio/webm.
const sampleFile = new URL("../public/samples/standup.webm", import.meta.url);
const scriptFile = new URL("../docs/sample-script.md", import.meta.url);
const generatorFile = new URL("./make-sample.sh", import.meta.url);

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];
const MAX_SAMPLE_BYTES = 1024 * 1024;

describe("sample recording", () => {
  it("is a WebM file of at most 1 MiB", async () => {
    const bytes = await readFile(sampleFile);

    expect([...bytes.subarray(0, 4)]).toEqual(EBML_MAGIC);
    expect(bytes.subarray(0, 64).toString("latin1")).toContain("webm");
    expect(bytes.byteLength).toBeLessThanOrEqual(MAX_SAMPLE_BYTES);
  });

  it("has a generator voice for every speaker in the script", async () => {
    const [script, generator] = await Promise.all([
      readFile(scriptFile, "utf8"),
      readFile(generatorFile, "utf8"),
    ]);
    const speakers = new Set(
      [...script.matchAll(/^\*\*([A-Za-z]+):\*\* /gm)].map((m) => m[1]),
    );

    expect([...speakers].sort()).toEqual(["Daniel", "Maya", "Priya"]);
    for (const speaker of speakers) {
      expect(generator).toContain(`${speaker}) echo `);
    }
  });
});
