import type { Meeting } from "@shared/schemas";
import { useEffect, useRef, useState } from "react";
import { ApiError, errorMessage, processMeeting } from "@/lib/api";

/** Starts a meeting left in `uploaded`, e.g. the saving tab closed early. */
export function useAutoProcess(
  meeting: Pick<Meeting, "id" | "status"> | null,
  refetch: () => Promise<void>,
): string | null {
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
        // 409: another tab already took the lease; other errors leave it stuck.
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
