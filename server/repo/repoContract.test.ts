import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Summary } from "../../shared/schemas.js";
import { createDb, type Db } from "../db/client.js";
import { meetings } from "../db/schema.js";
import { drizzleRepo } from "./drizzleRepo.js";
import { memoryRepo } from "./memoryRepo.js";
import { LIST_LIMIT, type MeetingRepo, type NewMeeting } from "./types.js";

type RepoFactory = {
  make: (now: () => Date) => MeetingRepo;
  reset: () => Promise<unknown>;
};

const T0 = new Date("2026-09-16T12:00:00.000Z");
const LEASE_MS = 60_000;

const input = (overrides: Partial<NewMeeting> = {}): NewMeeting => ({
  title: "Recording",
  titleEdited: false,
  source: "mic",
  audioPathname: "recordings/a.webm",
  contentType: "audio/webm",
  sizeBytes: 1024,
  durationSeconds: 12.5,
  createdIpHash: "ip-a",
  ...overrides,
});

const summary: Summary = {
  title: "Standup",
  overview: "x".repeat(200),
  keyTakeaways: ["a"],
  decisions: [],
  actionItems: [
    { task: "one", owner: null, due: null },
    { task: "two", owner: "Ana", due: "Friday" },
  ],
};

function describeMeetingRepo(name: string, factory: RepoFactory) {
  describe(name, () => {
    let clock: Date;
    let repo: MeetingRepo;
    const tick = (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    };

    beforeEach(async () => {
      await factory.reset();
      clock = T0;
      repo = factory.make(() => clock);
    });

    it("creates an uploaded meeting with defaults and timestamps", async () => {
      const row = await repo.create(
        input({ title: "Mine", titleEdited: true }),
      );

      expect(row.id).toEqual(expect.any(String));
      expect(row).toMatchObject({
        title: "Mine",
        titleEdited: true,
        status: "uploaded",
        attempts: 0,
        durationSeconds: 12.5,
        transcriptText: null,
        transcriptSegments: null,
        transcriptTruncated: false,
        summary: null,
        errorStep: null,
        processingStartedAt: null,
        createdIpHash: "ip-a",
      });
      expect(row.createdAt).toEqual(T0);
      expect(row.updatedAt).toEqual(T0);
      expect(await repo.get(row.id)).toEqual(row);
    });

    it("returns null for an unknown id", async () => {
      expect(await repo.get("00000000-0000-0000-0000-000000000000")).toBeNull();
    });

    it("lists newest first with the projection only", async () => {
      const older = await repo.create(input({ title: "Older" }));
      tick(1_000);
      const newer = await repo.create(input({ title: "Newer" }));
      await repo.update(older.id, {
        status: "done",
        transcriptText: "hello there",
        summary,
      });

      const list = await repo.list();

      expect(list.map((m) => m.id)).toEqual([newer.id, older.id]);
      expect(Object.keys(list[1] ?? {}).sort()).toEqual([
        "actionItemCount",
        "createdAt",
        "durationSeconds",
        "id",
        "overviewSnippet",
        "processingStartedAt",
        "source",
        "status",
        "title",
        "updatedAt",
      ]);
      expect(list[1]).toMatchObject({
        status: "done",
        overviewSnippet: "x".repeat(140),
        actionItemCount: 2,
      });
      expect(list[0]).toMatchObject({
        overviewSnippet: null,
        actionItemCount: 0,
      });
    });

    it(`lists at most ${LIST_LIMIT} meetings`, async () => {
      for (let i = 0; i <= LIST_LIMIT; i++) {
        await repo.create(input({ title: `Meeting ${i}` }));
        tick(1_000);
      }

      const list = await repo.list();

      expect(list).toHaveLength(LIST_LIMIT);
      expect(list[0]?.title).toBe(`Meeting ${LIST_LIMIT}`);
    });

    it("patches a meeting and bumps updatedAt", async () => {
      const row = await repo.create(input());
      tick(1_000);

      const updated = await repo.update(row.id, {
        status: "transcribed",
        transcriptText: "hello",
        transcriptSegments: [{ text: "hello", startSecond: 0, endSecond: 1 }],
      });

      expect(updated).toMatchObject({
        status: "transcribed",
        transcriptText: "hello",
        transcriptSegments: [{ text: "hello", startSecond: 0, endSecond: 1 }],
        createdAt: T0,
        updatedAt: clock,
      });
      expect(await repo.get(row.id)).toEqual(updated);
    });

    it("returns null when updating an unknown id", async () => {
      expect(
        await repo.update("00000000-0000-0000-0000-000000000000", {
          title: "x",
        }),
      ).toBeNull();
    });

    it("writes under a lease only while that lease is held", async () => {
      const row = await repo.create(input());
      await repo.claimLease(row.id, T0, LEASE_MS);

      expect(
        await repo.update(row.id, { status: "transcribing" }, T0),
      ).toMatchObject({ status: "transcribing" });

      const takeover = new Date(T0.getTime() + LEASE_MS + 1);
      await repo.claimLease(row.id, takeover, LEASE_MS);

      expect(await repo.update(row.id, { status: "done" }, T0)).toBeNull();
      expect(await repo.get(row.id)).toMatchObject({
        status: "transcribing",
        processingStartedAt: takeover,
      });
    });

    it("refuses a leased write when no lease is held", async () => {
      const row = await repo.create(input());

      expect(await repo.update(row.id, { title: "x" }, T0)).toBeNull();
    });

    it("deletes once", async () => {
      const row = await repo.create(input());

      expect(await repo.delete(row.id)).toBe(true);
      expect(await repo.delete(row.id)).toBe(false);
      expect(await repo.get(row.id)).toBeNull();
    });

    it("hides a deleted meeting from every read and write", async () => {
      const row = await repo.create(input());
      const kept = await repo.create(input({ title: "Kept" }));
      await repo.delete(row.id);

      expect((await repo.list()).map((m) => m.id)).toEqual([kept.id]);
      expect(await repo.update(row.id, { title: "x" })).toBeNull();
      expect(await repo.claimLease(row.id, T0, LEASE_MS)).toBeNull();
      expect(await repo.releaseLease(row.id, T0, {})).toBeNull();
    });

    it("still counts a deleted meeting as created", async () => {
      const row = await repo.create(input({ createdIpHash: "ip-a" }));
      await repo.delete(row.id);

      expect(await repo.countCreatedSince(T0)).toBe(1);
      expect(await repo.countCreatedSince(T0, "ip-a")).toBe(1);
    });

    it("counts creations since a time, optionally per ip hash", async () => {
      await repo.create(input({ createdIpHash: "ip-a" }));
      await repo.create(input({ createdIpHash: "ip-a" }));
      tick(10 * 60_000);
      await repo.create(input({ createdIpHash: "ip-b" }));
      const fiveMinutesIn = new Date(T0.getTime() + 5 * 60_000);

      expect(await repo.countCreatedSince(T0)).toBe(3);
      expect(await repo.countCreatedSince(T0, "ip-a")).toBe(2);
      expect(await repo.countCreatedSince(fiveMinutesIn)).toBe(1);
      expect(await repo.countCreatedSince(fiveMinutesIn, "ip-a")).toBe(0);
      expect(await repo.countCreatedSince(fiveMinutesIn, "ip-c")).toBe(0);
    });

    describe("claimLease", () => {
      it("claims a meeting without a lease", async () => {
        const row = await repo.create(input());
        const now = new Date(T0.getTime() + 5_000);

        const claimed = await repo.claimLease(row.id, now, LEASE_MS);

        expect(claimed).toMatchObject({
          id: row.id,
          status: "uploaded",
          processingStartedAt: now,
          updatedAt: now,
        });
      });

      it("refuses while the lease is fresh", async () => {
        const row = await repo.create(input());
        await repo.claimLease(row.id, T0, LEASE_MS);

        expect(
          await repo.claimLease(
            row.id,
            new Date(T0.getTime() + 1_000),
            LEASE_MS,
          ),
        ).toBeNull();
        expect(
          await repo.claimLease(
            row.id,
            new Date(T0.getTime() + LEASE_MS),
            LEASE_MS,
          ),
        ).toBeNull();
      });

      it("takes over a lease older than leaseMs", async () => {
        const row = await repo.create(input());
        await repo.claimLease(row.id, T0, LEASE_MS);
        const later = new Date(T0.getTime() + LEASE_MS + 1);

        const claimed = await repo.claimLease(row.id, later, LEASE_MS);

        expect(claimed?.processingStartedAt).toEqual(later);
      });

      it("lets exactly one of two concurrent claims win", async () => {
        const row = await repo.create(input());

        const results = await Promise.all([
          repo.claimLease(row.id, T0, LEASE_MS),
          repo.claimLease(row.id, T0, LEASE_MS),
        ]);

        expect(results.filter(Boolean)).toHaveLength(1);
      });

      it("refuses a done meeting", async () => {
        const row = await repo.create(input());
        await repo.update(row.id, { status: "done" });

        expect(await repo.claimLease(row.id, T0, LEASE_MS)).toBeNull();
      });

      it("refuses an unknown id", async () => {
        expect(
          await repo.claimLease(
            "00000000-0000-0000-0000-000000000000",
            T0,
            LEASE_MS,
          ),
        ).toBeNull();
      });
    });

    describe("releaseLease", () => {
      it("clears the lease and applies the patch", async () => {
        const row = await repo.create(input());
        await repo.claimLease(row.id, T0, LEASE_MS);
        tick(2_000);

        const released = await repo.releaseLease(row.id, T0, {
          status: "failed",
          errorStep: "transcribe",
          errorMessage: "Provider unavailable",
          errorRetryable: true,
          attempts: 1,
        });

        expect(released).toMatchObject({
          status: "failed",
          errorStep: "transcribe",
          errorMessage: "Provider unavailable",
          errorRetryable: true,
          attempts: 1,
          processingStartedAt: null,
          updatedAt: clock,
        });
        expect(await repo.claimLease(row.id, clock, LEASE_MS)).not.toBeNull();
      });

      it("leaves a lease that was taken over alone", async () => {
        const row = await repo.create(input());
        await repo.claimLease(row.id, T0, LEASE_MS);
        const takeover = new Date(T0.getTime() + LEASE_MS + 1);
        await repo.claimLease(row.id, takeover, LEASE_MS);

        expect(
          await repo.releaseLease(row.id, T0, { status: "failed" }),
        ).toBeNull();
        expect(await repo.get(row.id)).toMatchObject({
          status: "uploaded",
          processingStartedAt: takeover,
        });
      });

      it("returns null for an unknown id", async () => {
        expect(
          await repo.releaseLease(
            "00000000-0000-0000-0000-000000000000",
            T0,
            {},
          ),
        ).toBeNull();
      });
    });
  });
}

describeMeetingRepo("memoryRepo", {
  make: (now) => memoryRepo(now),
  reset: async () => {},
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";

describe.skipIf(!testDatabaseUrl)("with TEST_DATABASE_URL", () => {
  let db: Db;
  beforeAll(() => {
    db = createDb(testDatabaseUrl);
  });

  describeMeetingRepo("drizzleRepo", {
    make: (now) => drizzleRepo(() => db, now),
    reset: () => db.delete(meetings),
  });
});
