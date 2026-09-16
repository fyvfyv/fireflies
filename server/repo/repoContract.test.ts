import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { StoredSummary } from "../../shared/schemas.js";
import { createDb, type Db } from "../db/client.js";
import { meetings } from "../db/schema.js";
import { drizzleRepo } from "./drizzleRepo.js";
import { memoryRepo } from "./memoryRepo.js";
import {
  LIST_LIMIT,
  type MeetingPatch,
  type MeetingRepo,
  type NewMeeting,
} from "./types.js";

type RepoFactory = {
  make: (now: () => Date) => MeetingRepo;
  reset: () => Promise<unknown>;
};

const T0 = new Date("2026-09-16T12:00:00.000Z");
const LEASE_MS = 60_000;
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

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

const summary: StoredSummary = {
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
    const at = (ms: number) => new Date(T0.getTime() + ms);

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
        createdAt: T0,
        updatedAt: T0,
      });
      expect(await repo.get(row.id)).toEqual(row);
    });

    it("treats an unknown id as missing everywhere", async () => {
      expect(await repo.get(UNKNOWN_ID)).toBeNull();
      expect(await repo.update(UNKNOWN_ID, { title: "x" })).toBeNull();
      expect(await repo.delete(UNKNOWN_ID)).toBe(false);
      expect(await repo.claimLease(UNKNOWN_ID, T0, LEASE_MS)).toBeNull();
      expect(await repo.releaseLease(UNKNOWN_ID, T0, {})).toBeNull();
      expect(
        await repo.reopenLegacySummary(UNKNOWN_ID, T0, LEASE_MS, {}),
      ).toBeNull();
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

    it("writes under a lease only while that lease is held", async () => {
      const row = await repo.create(input());
      expect(await repo.update(row.id, { title: "x" }, T0)).toBeNull();
      await repo.claimLease(row.id, T0, LEASE_MS);

      expect(
        await repo.update(row.id, { status: "transcribing" }, T0),
      ).toMatchObject({ status: "transcribing" });

      const takeover = at(LEASE_MS + 1);
      await repo.claimLease(row.id, takeover, LEASE_MS);

      expect(await repo.update(row.id, { status: "done" }, T0)).toBeNull();
      expect(await repo.get(row.id)).toMatchObject({
        status: "transcribing",
        processingStartedAt: takeover,
      });
    });

    it("deletes once and hides the meeting from every read and write", async () => {
      const row = await repo.create(input());
      await repo.update(row.id, { status: "done", summary });
      const kept = await repo.create(input({ title: "Kept" }));

      expect(await repo.delete(row.id)).toBe(true);
      expect(await repo.delete(row.id)).toBe(false);
      expect(await repo.get(row.id)).toBeNull();
      expect((await repo.list()).map((m) => m.id)).toEqual([kept.id]);
      expect(await repo.update(row.id, { title: "x" })).toBeNull();
      expect(await repo.claimLease(row.id, T0, LEASE_MS)).toBeNull();
      expect(await repo.releaseLease(row.id, T0, {})).toBeNull();
      expect(
        await repo.reopenLegacySummary(row.id, T0, LEASE_MS, { title: "x" }),
      ).toBeNull();
    });

    it("counts creations since a time, per ip hash and including deleted ones", async () => {
      const deleted = await repo.create(input({ createdIpHash: "ip-a" }));
      await repo.delete(deleted.id);
      await repo.create(input({ createdIpHash: "ip-a" }));
      tick(10 * 60_000);
      await repo.create(input({ createdIpHash: "ip-b" }));
      const fiveMinutesIn = at(5 * 60_000);

      expect(await repo.countCreatedSince(T0)).toBe(3);
      expect(await repo.countCreatedSince(T0, "ip-a")).toBe(2);
      expect(await repo.countCreatedSince(fiveMinutesIn)).toBe(1);
      expect(await repo.countCreatedSince(fiveMinutesIn, "ip-a")).toBe(0);
      expect(await repo.countCreatedSince(T0, "ip-c")).toBe(0);
    });

    describe("claimLease", () => {
      it("claims a free meeting, then refuses until the lease is older than leaseMs", async () => {
        const row = await repo.create(input());

        expect(await repo.claimLease(row.id, T0, LEASE_MS)).toMatchObject({
          id: row.id,
          status: "uploaded",
          processingStartedAt: T0,
        });
        expect(
          await repo.claimLease(row.id, at(LEASE_MS), LEASE_MS),
        ).toBeNull();
        expect(
          await repo.claimLease(row.id, at(LEASE_MS + 1), LEASE_MS),
        ).toMatchObject({
          processingStartedAt: at(LEASE_MS + 1),
          updatedAt: at(LEASE_MS + 1),
        });
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
    });

    describe("reopenLegacySummary", () => {
      const reopen = { status: "transcribed", summary: null } as const;
      const seedDone = async (patch: MeetingPatch = {}) => {
        const row = await repo.create(input());
        await repo.update(row.id, { status: "done", summary, ...patch });
        return row.id;
      };

      it.each<[string, MeetingPatch]>([
        ["no notes key", {}],
        ["an empty notes list", { summary: { ...summary, notes: [] } }],
      ])("patches a done meeting whose summary has %s", async (_, patch) => {
        const id = await seedDone(patch);
        tick(1_000);

        const reopened = await repo.reopenLegacySummary(
          id,
          clock,
          LEASE_MS,
          reopen,
        );

        expect(reopened).toMatchObject({
          id,
          status: "transcribed",
          summary: null,
          processingStartedAt: null,
          updatedAt: clock,
        });
        expect(await repo.get(id)).toEqual(reopened);
      });

      it.each<[string, MeetingPatch]>([
        ["a meeting that is not done", { status: "transcribed" }],
        [
          "a summary with notes",
          {
            summary: {
              ...summary,
              notes: [
                { heading: "h", gist: "g", startSecond: null, points: [] },
              ],
            },
          },
        ],
      ])("refuses %s", async (_, patch) => {
        const id = await seedDone(patch);
        const before = await repo.get(id);

        expect(
          await repo.reopenLegacySummary(id, T0, LEASE_MS, reopen),
        ).toBeNull();
        expect(await repo.get(id)).toEqual(before);
      });

      it("refuses while a lease is fresh and not once it expired", async () => {
        const id = await seedDone({ processingStartedAt: T0 });

        expect(
          await repo.reopenLegacySummary(id, at(LEASE_MS), LEASE_MS, reopen),
        ).toBeNull();
        expect(
          await repo.reopenLegacySummary(
            id,
            at(LEASE_MS + 1),
            LEASE_MS,
            reopen,
          ),
        ).toMatchObject({ status: "transcribed" });
      });

      it("lets exactly one of two concurrent reopens win", async () => {
        const id = await seedDone();

        const results = await Promise.all([
          repo.reopenLegacySummary(id, T0, LEASE_MS, reopen),
          repo.reopenLegacySummary(id, T0, LEASE_MS, reopen),
        ]);

        expect(results.filter(Boolean)).toHaveLength(1);
      });
    });

    describe("releaseLease", () => {
      it("clears the lease and applies the patch", async () => {
        const row = await repo.create(input());
        await repo.claimLease(row.id, T0, LEASE_MS);
        tick(2_000);
        const patch: MeetingPatch = {
          status: "failed",
          errorStep: "transcribe",
          errorMessage: "Provider unavailable",
          errorRetryable: true,
          attempts: 1,
        };

        const released = await repo.releaseLease(row.id, T0, patch);

        expect(released).toMatchObject({
          ...patch,
          processingStartedAt: null,
          updatedAt: clock,
        });
        expect(await repo.claimLease(row.id, clock, LEASE_MS)).not.toBeNull();
      });

      it("leaves a lease that was taken over alone", async () => {
        const row = await repo.create(input());
        await repo.claimLease(row.id, T0, LEASE_MS);
        const takeover = at(LEASE_MS + 1);
        await repo.claimLease(row.id, takeover, LEASE_MS);

        expect(
          await repo.releaseLease(row.id, T0, { status: "failed" }),
        ).toBeNull();
        expect(await repo.get(row.id)).toMatchObject({
          status: "uploaded",
          processingStartedAt: takeover,
        });
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
