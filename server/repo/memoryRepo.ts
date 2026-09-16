import { randomUUID } from "node:crypto";
import {
  DELETED_CONTENT,
  LIST_LIMIT,
  type MeetingPatch,
  type MeetingRepo,
  type MeetingRow,
  OVERVIEW_SNIPPET_LENGTH,
} from "./types.js";

// Rows are cloned on the way in and out so callers can't mutate stored state,
// matching what a real database gives them.
export function memoryRepo(now: () => Date = () => new Date()): MeetingRepo {
  const rows = new Map<string, MeetingRow>();
  const liveRow = (id: string) => {
    const row = rows.get(id);
    return row && row.deletedAt === null ? row : undefined;
  };

  const leaseHeld = (row: MeetingRow, at: Date, leaseMs: number) => {
    const lease = row.processingStartedAt;
    return lease !== null && lease.getTime() >= at.getTime() - leaseMs;
  };

  const patchRow = (id: string, patch: MeetingPatch, lease?: Date) => {
    const row = liveRow(id);
    if (!row) return null;
    if (lease && row.processingStartedAt?.getTime() !== lease.getTime()) {
      return null;
    }
    const next = { ...row, ...structuredClone(patch), updatedAt: now() };
    rows.set(id, next);
    return structuredClone(next);
  };

  return {
    async create(meeting) {
      const at = now();
      const row: MeetingRow = {
        language: null,
        transcriptText: null,
        transcriptSegments: null,
        transcriptTruncated: false,
        sttProvider: null,
        summary: null,
        errorStep: null,
        errorMessage: null,
        errorRetryable: null,
        attempts: 0,
        processingStartedAt: null,
        deletedAt: null,
        ...structuredClone(meeting),
        id: randomUUID(),
        status: "uploaded",
        createdAt: at,
        updatedAt: at,
      };
      rows.set(row.id, row);
      return structuredClone(row);
    },

    async get(id) {
      const row = liveRow(id);
      return row ? structuredClone(row) : null;
    },

    async list() {
      return [...rows.values()]
        .filter((row) => row.deletedAt === null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, LIST_LIMIT)
        .map((row) =>
          structuredClone({
            id: row.id,
            title: row.title,
            status: row.status,
            source: row.source,
            durationSeconds: row.durationSeconds,
            processingStartedAt: row.processingStartedAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            overviewSnippet:
              row.summary?.overview.slice(0, OVERVIEW_SNIPPET_LENGTH) ?? null,
            actionItemCount: row.summary?.actionItems.length ?? 0,
          }),
        );
    },

    async update(id, patch, lease) {
      return patchRow(id, patch, lease);
    },

    async delete(id) {
      const row = liveRow(id);
      if (!row) return false;
      const at = now();
      rows.set(id, {
        ...row,
        ...DELETED_CONTENT,
        deletedAt: at,
        updatedAt: at,
      });
      return true;
    },

    async countCreatedSince(since, ipHash) {
      return [...rows.values()].filter(
        (row) =>
          row.createdAt.getTime() >= since.getTime() &&
          (ipHash === undefined || row.createdIpHash === ipHash),
      ).length;
    },

    async claimLease(id, at, leaseMs) {
      const row = liveRow(id);
      if (!row || row.status === "done" || leaseHeld(row, at, leaseMs)) {
        return null;
      }
      const claimed = { ...row, processingStartedAt: at, updatedAt: at };
      rows.set(id, claimed);
      return structuredClone(claimed);
    },

    async reopenLegacySummary(id, at, leaseMs, patch) {
      const row = liveRow(id);
      if (row?.status !== "done" || row.summary?.notes?.length) return null;
      if (leaseHeld(row, at, leaseMs)) return null;
      return patchRow(id, patch);
    },

    async releaseLease(id, lease, patch) {
      return patchRow(id, { ...patch, processingStartedAt: null }, lease);
    },
  };
}
