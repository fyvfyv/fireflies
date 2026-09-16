import { beforeEach, describe, expect, it, vi } from "vitest";
import { meetingFixture, meetingListItemFixture } from "@/test/fixtures";
import {
  ApiError,
  createMeeting,
  deleteMeeting,
  errorMessage,
  getMeeting,
  listMeetings,
  processMeeting,
} from "./api";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(
  body: unknown,
  init: ResponseInit & { headers?: Record<string, string> } = {},
) {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function envelope(code: string, message: string, retryable: boolean) {
  return { error: { code, message, retryable } };
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const err = await promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  return err as ApiError;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("requests", () => {
  it("lists meetings", async () => {
    const rows = [meetingListItemFixture()];
    fetchMock.mockResolvedValueOnce(jsonResponse(rows));

    await expect(listMeetings()).resolves.toEqual(rows);
    expect(fetchMock).toHaveBeenCalledWith("/api/meetings", {
      method: "GET",
    });
  });

  it("gets a meeting by encoded id", async () => {
    const meeting = meetingFixture({ id: "a/b" });
    fetchMock.mockResolvedValueOnce(jsonResponse(meeting));

    await expect(getMeeting("a/b")).resolves.toEqual(meeting);
    expect(fetchMock).toHaveBeenCalledWith("/api/meetings/a%2Fb", {
      method: "GET",
    });
  });

  it("creates a meeting with a JSON body", async () => {
    const meeting = meetingFixture({ status: "uploaded", summary: null });
    fetchMock.mockResolvedValueOnce(jsonResponse(meeting, { status: 201 }));
    const input = {
      title: "Planning",
      audioPathname: "recordings/abc.webm",
      contentType: "audio/webm",
      sizeBytes: 1024,
      source: "mic" as const,
      durationSeconds: 12,
    };

    await expect(createMeeting(input)).resolves.toEqual(meeting);
    expect(fetchMock).toHaveBeenCalledWith("/api/meetings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  });

  it("starts processing", async () => {
    const meeting = meetingFixture();
    fetchMock.mockResolvedValueOnce(jsonResponse(meeting));

    await expect(processMeeting("abc")).resolves.toEqual(meeting);
    expect(fetchMock).toHaveBeenCalledWith("/api/meetings/abc/process", {
      method: "POST",
    });
  });

  it("deletes without reading the empty 204 body", async () => {
    const response = new Response(null, { status: 204 });
    const json = vi.spyOn(response, "json");
    fetchMock.mockResolvedValueOnce(response);

    await expect(deleteMeeting("x")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/meetings/x", {
      method: "DELETE",
    });
    expect(json).not.toHaveBeenCalled();
  });
});

describe("errors", () => {
  it("maps a 429 envelope", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(envelope("rate_limited", "Too many recordings", true), {
        status: 429,
      }),
    );

    const err = await rejection(listMeetings());

    expect(err).toMatchObject({
      status: 429,
      code: "rate_limited",
      message: "Too many recordings",
      retryable: true,
    });
  });

  it("keeps the envelope of a 404", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(envelope("not_found", "Meeting not found", false), {
        status: 404,
      }),
    );

    const err = await rejection(getMeeting("nope"));

    expect(err).toMatchObject({
      status: 404,
      code: "not_found",
      retryable: false,
    });
  });

  it("maps a rejected fetch to a retryable network error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const err = await rejection(listMeetings());

    expect(err).toMatchObject({ code: "network", retryable: true, status: 0 });
  });

  it("rejects a body that fails the shared schema", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "abc" }));

    const err = await rejection(getMeeting("abc"));

    expect(err).toMatchObject({
      code: "bad_response",
      retryable: false,
      status: 200,
    });
  });

  it("rejects a success body that is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html></html>"));

    const err = await rejection(listMeetings());

    expect(err.code).toBe("bad_response");
  });

  it("falls back to the status code for a non-envelope error", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>Internal error</html>", { status: 500 }),
    );

    const err = await rejection(processMeeting("abc"));

    expect(err).toMatchObject({
      status: 500,
      code: "http_500",
      retryable: true,
    });
    expect(err.message).not.toContain("<html>");
  });

  it("treats a non-envelope 4xx as not retryable", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ nope: 1 }, { status: 413 }));

    const err = await rejection(listMeetings());

    expect(err).toMatchObject({ code: "http_413", retryable: false });
  });
});

describe("errorMessage", () => {
  it("uses the API message", () => {
    const err = new ApiError({
      status: 429,
      code: "rate_limited",
      message: "Too many recordings",
      retryable: true,
    });

    expect(errorMessage(err)).toBe("Too many recordings");
  });

  it("hides messages of unknown errors", () => {
    expect(errorMessage(new Error("stack details"))).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
