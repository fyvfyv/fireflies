import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { postJson, validCreateBody } from "../test/requests.js";
import { testDeps } from "../test/testDeps.js";

describe("create rate limit", () => {
  let clock: Date;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    clock = new Date("2026-09-16T12:00:00.000Z");
    app = createApp(testDeps({ now: () => clock }));
  });

  const createFrom = (ip: string) =>
    postJson(
      app,
      "/api/meetings",
      validCreateBody,
      ip ? { "x-forwarded-for": ip } : {},
    );

  const createTimes = async (n: number, ip: (i: number) => string) => {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const res = await createFrom(ip(i));
      expect(res.status).toBe(201);
      ids.push(((await res.json()) as { id: string }).id);
    }
    return ids;
  };

  it("rejects the 11th create from one client within an hour", async () => {
    await createTimes(10, () => "1.1.1.1");

    const res = await createFrom("1.1.1.1");

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("3600");
    expect(await res.json()).toMatchObject({
      error: { code: "rate_limited", retryable: true },
    });
    expect((await createFrom("2.2.2.2")).status).toBe(201);
  });

  it("buckets by the first x-forwarded-for hop", async () => {
    await createTimes(10, (i) => `1.1.1.1, 10.0.0.${i}`);

    expect((await createFrom("1.1.1.1, 10.0.0.99")).status).toBe(429);
  });

  it("puts requests without x-forwarded-for in one bucket", async () => {
    await createTimes(10, () => "");

    expect((await createFrom("")).status).toBe(429);
  });

  it("rejects the 31st create overall", async () => {
    await createTimes(30, (i) => `10.0.${i}.1`);

    const res = await createFrom("3.3.3.3");

    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({
      error: { code: "rate_limited" },
    });
  });

  it("forgets creates older than an hour", async () => {
    await createTimes(10, () => "1.1.1.1");
    clock = new Date(clock.getTime() + 60 * 60_000 + 1);

    expect((await createFrom("1.1.1.1")).status).toBe(201);
  });

  it("limits only creates and keeps counting deleted meetings", async () => {
    const headers = { "x-forwarded-for": "1.1.1.1" };
    for (const id of await createTimes(10, () => "1.1.1.1")) {
      const res = await app.request(`/api/meetings/${id}`, {
        method: "DELETE",
        headers,
      });
      expect(res.status).toBe(204);
    }

    expect((await app.request("/api/meetings", { headers })).status).toBe(200);
    expect((await createFrom("1.1.1.1")).status).toBe(429);
  });
});
