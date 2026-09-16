import type { Meeting } from "@shared/schemas";
import { useEffect, useRef, useState } from "react";
import { ApiError, errorMessage, processMeeting } from "@/lib/api";

/**
 * Starts the pipeline for a meeting left in `uploaded`, e.g. when the tab that
 * saved it closed before its own process request went out. Returns why the
 * start failed while the meeting is still waiting to start.
 */
export function useAutoProcess(
  meeting: Pick<Meeting, "id" | "status"> | null,
  refetch: () => Promise<void>,
): string | null {
  // One attempt per meeting per mount; the returned error offers a retry.
  const startedFor = useRef<string | null>(null);
  const [failure, setFailure] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const id = meeting?.id;
  const status = meeting?.status;

  useEffect(() => {
    if (!id || status !== "uploaded" || startedFor.current === id) return;
    startedFor.current = id;
    processMeeting(id)
      .catch((err: unknown) => {
        // A 409 means the saving tab already started the run. Anything else
        // (e.g. a 5xx before the lease was taken) leaves the meeting waiting
        // with nothing left to start it.
        if (!(err instanceof ApiError && err.status === 409)) {
          setFailure({ id, message: errorMessage(err) });
        }
      })
      .then(refetch);
  }, [id, status, refetch]);

  return failure && failure.id === id && status === "uploaded"
    ? failure.message
    : null;
}
