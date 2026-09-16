import type { ContentfulStatusCode } from "hono/utils/http-status";

export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly retryable: boolean;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export const meetingNotFound = () =>
  new HttpError(404, "not_found", "Meeting not found", false);

export function errorBody(code: string, message: string, retryable: boolean) {
  return { error: { code, message, retryable } };
}

type ValidationResult =
  | { success: true }
  | {
      success: false;
      error: { issues: { message: string; path: PropertyKey[] }[] };
    };

// Without a hook, @hono/zod-validator answers with its own 400 body and never
// reaches onError; throwing here keeps the error envelope.
export function validationHook(result: ValidationResult) {
  if (result.success) return;
  const issue = result.error.issues[0];
  const message = issue
    ? [...issue.path.map(String), issue.message].join(": ")
    : "Invalid body";
  throw new HttpError(400, "validation", message, false);
}
