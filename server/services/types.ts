import type { Segment, Summary } from "../../shared/schemas.js";

export type SummaryInput = { text: string; segments: Segment[] | null };

export type SummaryResult = {
  summary: Summary;
  model: string;
  truncated: boolean;
};

export class SummaryError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean, options?: ErrorOptions) {
    super(message, options);
    this.name = "SummaryError";
    this.retryable = retryable;
  }
}
