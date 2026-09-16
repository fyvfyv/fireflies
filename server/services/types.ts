import type { Summary } from "../../shared/schemas.js";

export type SummaryResult = {
  summary: Summary;
  model: string;
  /** The transcript was cut to fit the prompt. */
  truncated: boolean;
};

// Like SttError, the message is persisted and shown to users.
export class SummaryError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean, options?: ErrorOptions) {
    super(message, options);
    this.name = "SummaryError";
    this.retryable = retryable;
  }
}
