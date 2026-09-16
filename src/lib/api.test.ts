import { beforeEach, describe, expect, it, vi } from "vitest";
import { meetingFixture, meetingListItemFixture } from "@/test/fixtures";
import {
  ApiError,
  createMeeting,
  deleteMeeting,
  errorMessage,
  getAudioUrl,
  getMeeting,
  listMeetings,
  processMeeting,
  regenerateNotes,
} from "./api";

const fetchMock = vi.fn<typeof fetch>();

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("requests", () => {
  const meeting = meetingFixture();
  const audio = {
    url: "https://store.private.blob.vercel-storage.com/recordings/abc.webm?sig=1",
    expiresAt: "2026-09-16T13:00:00.000Z",
  };

  it.each([
    ["GET", "/meetings", () => listMeetings(), [meetingListItemFixture()]],
    ["GET", "/meetings/a%2Fb", () => getMeeting("a/b"), meeting],
    ["POST", "/meetings/abc/process", () => processMeeting("abc"), meeting],
    ["GET", "/meetings/a%2Fb/audio", () => getAudioUrl("a/b"), audio],
    ["POST", "/meetings/abc/notes", () => regenerateNotes("abc"), meeting],
  ])("%s %s", async (method, path, call, body) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(body));

    await expect(call()).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(`/api${path}`, { method });
  });

  it("creates a meeting with a JSON body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(meeting, 201));
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
  it("maps the error envelope", async () => {
    const error = {
      code: "rate_limited",
      message: "Too many recordings",
      retryable: true,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse({ error }, 429));

    const err = await listMeetings().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, ...error });
  });

  it.each([
    [500, true],
    [413, false],
  ])(
    "falls back to the status for a non-envelope %s",
    async (status, retryable) => {
      fetchMock.mockResolvedValueOnce(
        new Response("<html>Internal error</html>", { status }),
      );

      await expect(processMeeting("abc")).rejects.toMatchObject({
        status,
        code: `http_${status}`,
        message: `Request failed (${status}).`,
        retryable,
      });
    },
  );

  it("maps a rejected fetch to a retryable network error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(listMeetings()).rejects.toMatchObject({
      status: 0,
      code: "network",
      retryable: true,
    });
  });

  it.each([
    ["fails the shared schema", () => getMeeting("abc"), { id: "abc" }],
    [
      "is an audio url without an expiry",
      () => getAudioUrl("abc"),
      { url: "https://store.private.blob.vercel-storage.com/a.webm" },
    ],
    ["is not JSON", () => getMeeting("abc"), null],
  ])("rejects a success body that %s", async (_, call, body) => {
    fetchMock.mockResolvedValueOnce(
      body ? jsonResponse(body) : new Response("<html></html>"),
    );

    await expect(call()).rejects.toMatchObject({
      status: 200,
      code: "bad_response",
      retryable: false,
    });
  });
});

it("errorMessage shows API messages and hides unknown ones", () => {
  const err = new ApiError({
    status: 429,
    code: "rate_limited",
    message: "Too many recordings",
    retryable: true,
  });

  expect(errorMessage(err)).toBe("Too many recordings");
  expect(errorMessage(new Error("stack details"))).toBe(
    "Something went wrong. Please try again.",
  );
});
