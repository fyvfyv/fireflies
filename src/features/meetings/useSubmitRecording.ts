import { MAX_AUDIO_BYTES } from "@shared/constants";
import type { Source } from "@shared/schemas";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { createMeeting, errorMessage, processMeeting } from "@/lib/api";
import { type UploadedAudio, uploadAudio } from "@/lib/upload";

export type SubmitInput = {
  blob: Blob;
  contentType: string;
  durationSeconds?: number;
  title?: string;
  source: Source;
};

export type SubmitPhase = "upload" | "create";

type SubmitState = {
  phase: SubmitPhase | null;
  error: string | null;
  canRetry: boolean;
};

const IDLE: SubmitState = { phase: null, error: null, canRetry: false };

const UPLOAD_FAILED =
  "Couldn't upload the audio. Check your connection and try again.";
// The upload token would reject it with a misleading network-style error.
const TOO_LARGE = `This recording is over the ${MAX_AUDIO_BYTES / 1024 / 1024} MB limit, so it can't be transcribed. You can still download it.`;

export function useSubmitRecording() {
  const navigate = useNavigate();
  const [state, setState] = useState<SubmitState>(IDLE);
  const pendingRef = useRef<{
    input: SubmitInput;
    uploaded?: UploadedAudio;
  } | null>(null);
  const busyRef = useRef(false);
  const targetRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const submit = useCallback(
    async (input: SubmitInput) => {
      if (busyRef.current) return;
      if (input.blob.size > MAX_AUDIO_BYTES) {
        pendingRef.current = null;
        setState({ phase: null, error: TOO_LARGE, canRetry: false });
        return;
      }
      busyRef.current = true;
      const previous = pendingRef.current;
      const pending = {
        input,
        uploaded:
          previous?.input.blob === input.blob ? previous.uploaded : undefined,
      };
      pendingRef.current = pending;

      let phase: SubmitPhase = "upload";
      try {
        if (!pending.uploaded) {
          setState({ ...IDLE, phase });
          pending.uploaded = await uploadAudio(input.blob, input.contentType);
        }
        phase = "create";
        setState({ ...IDLE, phase });
        const { pathname, sizeBytes, contentType } = pending.uploaded;
        const meeting = await createMeeting({
          title: input.title,
          audioPathname: pathname,
          contentType,
          sizeBytes,
          source: input.source,
          durationSeconds: input.durationSeconds,
        });
        pendingRef.current = null;
        // Detached: outlives this page; the meeting page polls for the result.
        processMeeting(meeting.id).catch(() => {});
        // The user left mid-save; navigating now would still pull them back.
        if (!mountedRef.current) return;
        targetRef.current = `/m/${meeting.id}`;
        navigate(targetRef.current);
      } catch (err) {
        setState({
          phase,
          error: phase === "upload" ? UPLOAD_FAILED : errorMessage(err),
          canRetry: true,
        });
      } finally {
        busyRef.current = false;
        targetRef.current = null;
      }
    },
    [navigate],
  );

  const retry = useCallback(async () => {
    const pending = pendingRef.current;
    if (pending) await submit(pending.input);
  }, [submit]);

  const clear = useCallback(() => {
    pendingRef.current = null;
    setState(IDLE);
  }, []);

  // A ref, not state: the router runs blockers synchronously inside navigate().
  const isOwnNavigation = useCallback(
    (pathname: string) => targetRef.current === pathname,
    [],
  );

  return {
    ...state,
    busy: state.phase !== null && state.error === null,
    submit,
    retry,
    clear,
    isOwnNavigation,
  };
}
