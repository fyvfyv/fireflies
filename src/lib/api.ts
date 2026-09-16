import {
  apiErrorSchema,
  audioUrlSchema,
  type CreateMeetingInput,
  meetingListItemSchema,
  meetingSchema,
} from "@shared/schemas";
import { z } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    retryable: boolean;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.retryable = init.retryable;
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof ApiError
    ? err.message
    : "Something went wrong. Please try again.";
}

async function send(path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError({
      status: 0,
      code: "network",
      message: "Can't reach the server. Check your connection and try again.",
      retryable: true,
    });
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

async function toApiError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    return new ApiError({ status: res.status, ...parsed.data.error });
  }
  // Proxy and platform errors (HTML pages, 413s) carry no envelope.
  return new ApiError({
    status: res.status,
    code: `http_${res.status}`,
    message: `Request failed (${res.status}).`,
    retryable: res.status >= 500,
  });
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = { method: "GET" },
): Promise<T> {
  const res = await send(path, init);
  const body: unknown = await res.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      status: res.status,
      code: "bad_response",
      message: "The server sent an unexpected response.",
      retryable: false,
    });
  }
  return parsed.data;
}

const meetingPath = (id: string) => `/meetings/${encodeURIComponent(id)}`;

export function listMeetings() {
  return request("/meetings", z.array(meetingListItemSchema));
}

export function getMeeting(id: string) {
  return request(meetingPath(id), meetingSchema);
}

export function createMeeting(input: CreateMeetingInput) {
  return request("/meetings", meetingSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function processMeeting(id: string) {
  return request(`${meetingPath(id)}/process`, meetingSchema, {
    method: "POST",
  });
}

export function getAudioUrl(id: string) {
  return request(`${meetingPath(id)}/audio`, audioUrlSchema);
}

export function regenerateNotes(id: string) {
  return request(`${meetingPath(id)}/notes`, meetingSchema, {
    method: "POST",
  });
}

export async function deleteMeeting(id: string): Promise<void> {
  await send(meetingPath(id), { method: "DELETE" });
}
