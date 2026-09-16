import { randomUUID } from "node:crypto";
import {
  and,
  count,
  desc,
  eq,
  gte,
  isNull,
  lt,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Db } from "../db/client.js";
import { meetings } from "../db/schema.js";
import {
  DELETED_CONTENT,
  LIST_LIMIT,
  type MeetingPatch,
  type MeetingRepo,
  OVERVIEW_SNIPPET_LENGTH,
} from "./types.js";

const live = (id: string, ...conditions: (SQL | undefined)[]) =>
  and(eq(meetings.id, id), isNull(meetings.deletedAt), ...conditions);

// Timestamps come from the injected JS clock, not the database's now(), so the
// lease comparison and rate-limit windows all use one clock. The database is
// passed as a getter so importing the app (e.g. for the health check) never
// requires DATABASE_URL.
export function drizzleRepo(
  getDb: () => Db,
  now: () => Date = () => new Date(),
): MeetingRepo {
  const patchRow = async (id: string, patch: MeetingPatch, lease?: Date) => {
    const [row] = await getDb()
      .update(meetings)
      .set({ ...patch, updatedAt: now() })
      .where(
        live(
          id,
          lease === undefined
            ? undefined
            : eq(meetings.processingStartedAt, lease),
        ),
      )
      .returning();
    return row ?? null;
  };

  return {
    async create(meeting) {
      const at = now();
      const [row] = await getDb()
        .insert(meetings)
        .values({
          ...meeting,
          id: randomUUID(),
          status: "uploaded",
          createdAt: at,
          updatedAt: at,
        })
        .returning();
      if (!row) throw new Error("Insert returned no row");
      return row;
    },

    async get(id) {
      const [row] = await getDb().select().from(meetings).where(live(id));
      return row ?? null;
    },

    async list() {
      return getDb()
        .select({
          id: meetings.id,
          title: meetings.title,
          status: meetings.status,
          source: meetings.source,
          durationSeconds: meetings.durationSeconds,
          processingStartedAt: meetings.processingStartedAt,
          createdAt: meetings.createdAt,
          updatedAt: meetings.updatedAt,
          overviewSnippet: sql<
            string | null
          >`left(${meetings.summary}->>'overview', ${OVERVIEW_SNIPPET_LENGTH})`,
          actionItemCount:
            sql<number>`coalesce(jsonb_array_length(${meetings.summary}->'actionItems'), 0)`.mapWith(
              Number,
            ),
        })
        .from(meetings)
        .where(isNull(meetings.deletedAt))
        .orderBy(desc(meetings.createdAt))
        .limit(LIST_LIMIT);
    },

    update: patchRow,

    async delete(id) {
      const at = now();
      const deleted = await getDb()
        .update(meetings)
        .set({ ...DELETED_CONTENT, deletedAt: at, updatedAt: at })
        .where(live(id))
        .returning({ id: meetings.id });
      return deleted.length > 0;
    },

    async countCreatedSince(since, ipHash) {
      const [result] = await getDb()
        .select({ n: count() })
        .from(meetings)
        .where(
          and(
            gte(meetings.createdAt, since),
            ipHash === undefined
              ? undefined
              : eq(meetings.createdIpHash, ipHash),
          ),
        );
      return result?.n ?? 0;
    },

    // One conditional UPDATE ... RETURNING: neon-http has no interactive
    // transactions, and this is race-free without one.
    async claimLease(id, at, leaseMs) {
      const [row] = await getDb()
        .update(meetings)
        .set({ processingStartedAt: at, updatedAt: at })
        .where(
          live(
            id,
            ne(meetings.status, "done"),
            or(
              isNull(meetings.processingStartedAt),
              lt(
                meetings.processingStartedAt,
                new Date(at.getTime() - leaseMs),
              ),
            ),
          ),
        )
        .returning();
      return row ?? null;
    },

    async releaseLease(id, lease, patch) {
      return patchRow(id, { ...patch, processingStartedAt: null }, lease);
    },
  };
}
