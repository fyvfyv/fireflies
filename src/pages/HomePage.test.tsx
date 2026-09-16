import { MAX_AUDIO_BYTES } from "@shared/constants";
import type { Meeting, MeetingListItem } from "@shared/schemas";
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createMeeting,
  listMeetings,
  processMeeting,
} from "@/lib/api";
import { uploadAudio } from "@/lib/upload";
import { FakeMediaRecorder } from "@/test/fakeMediaRecorder";
import { meetingFixture, meetingListItemFixture } from "@/test/fixtures";
import { renderWithRouter } from "@/test/router";
import { HomePage } from "./HomePage";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listMeetings: vi.fn(),
  createMeeting: vi.fn(),
  processMeeting: vi.fn(),
}));
vi.mock("@/lib/upload", () => ({ uploadAudio: vi.fn() }));

const mockedList = vi.mocked(listMeetings);
const mockedUpload = vi.mocked(uploadAudio);

const transcribing = meetingListItemFixture({
  id: "t1",
  title: "In flight",
  status: "transcribing",
});
const uploaded = {
  pathname: "recordings/u1.webm",
  sizeBytes: 1,
  contentType: "audio/webm",
};
const networkDown = new ApiError({
  status: 0,
  code: "network",
  message: "Network down",
  retryable: true,
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mockedList.mockReset();
});

describe("HomePage", () => {
  it("leads with the hero and the recorder, then loads the meetings", async () => {
    const { promise, resolve } = deferred<MeetingListItem[]>();
    mockedList.mockReturnValue(promise);

    renderWithRouter(<HomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /Record the meeting/ }),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "Recorder" })).toBeVisible();
    expect(screen.getByText("Loading meetings…")).toBeInTheDocument();

    await act(async () => resolve([meetingListItemFixture()]));

    expect(screen.queryByText("Loading meetings…")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Weekly sync" })).toBeVisible();
  });

  it("shows a load error with a retry", async () => {
    mockedList
      .mockRejectedValueOnce(networkDown)
      .mockResolvedValue([meetingListItemFixture()]);
    const user = userEvent.setup();
    renderWithRouter(<HomePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("link", { name: "Weekly sync" }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains when the browser can't record, offering the options once", async () => {
    mockedList.mockResolvedValue([]);
    renderWithRouter(<HomePage />);

    expect(
      await screen.findByText("Recording isn't available in this browser"),
    ).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Try a 2-minute sample" }),
    ).toHaveLength(1);
  });

  describe("polling", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    const tick = () => act(() => vi.advanceTimersByTimeAsync(5_000));

    it("refetches every 5 s until nothing is processing", async () => {
      mockedList
        .mockResolvedValueOnce([transcribing])
        .mockResolvedValueOnce([{ ...transcribing, status: "summarizing" }])
        .mockResolvedValue([{ ...transcribing, status: "done" }]);
      renderWithRouter(<HomePage />);
      await screen.findByText("Transcribing");

      await tick();
      expect(await screen.findByText("Writing notes")).toBeInTheDocument();
      await tick();
      expect(await screen.findByText("Done")).toBeInTheDocument();
      await tick();
      await tick();

      expect(mockedList).toHaveBeenCalledTimes(3);
    });

    it.each([
      ["uploaded", { status: "uploaded" }],
      ["done", { status: "done" }],
      ["failed", { status: "failed" }],
      ["stalled", { stalled: true }],
    ] as const)("does not poll for a %s meeting", async (_case, overrides) => {
      mockedList.mockResolvedValue([{ ...transcribing, ...overrides }]);
      renderWithRouter(<HomePage />);
      await screen.findByText("In flight");

      await tick();
      await tick();

      expect(mockedList).toHaveBeenCalledTimes(1);
    });

    it("keeps the rows and polling through a failed refetch", async () => {
      mockedList
        .mockResolvedValueOnce([transcribing])
        .mockRejectedValueOnce(networkDown)
        .mockResolvedValue([transcribing]);
      renderWithRouter(<HomePage />);
      await screen.findByText("In flight");

      await tick();
      expect(screen.getByRole("alert")).toHaveTextContent("Network down");
      expect(screen.getByText("In flight")).toBeInTheDocument();

      await tick();
      expect(mockedList).toHaveBeenCalledTimes(3);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("with a microphone", () => {
    const trackStop = vi.fn();
    const audio = new File(["x"], "call.m4a", { type: "audio/mp4" });
    const text = new File(["x"], "notes.txt", { type: "text/plain" });
    const drag = (file: File) => ({
      dataTransfer: { types: ["Files"], files: [file], dropEffect: "none" },
    });

    beforeEach(() => {
      mockedList.mockResolvedValue([meetingListItemFixture()]);
      vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: vi.fn(async () => ({
            getTracks: () => [{ stop: trackStop }],
          })),
        },
      });
      mockedUpload.mockReset().mockResolvedValue(uploaded);
      vi.mocked(createMeeting)
        .mockReset()
        .mockResolvedValue(meetingFixture({ id: "m1", status: "uploaded" }));
      vi.mocked(processMeeting)
        .mockReset()
        .mockResolvedValue(meetingFixture({ id: "m1" }));
    });

    afterEach(() => {
      Reflect.deleteProperty(navigator, "mediaDevices");
    });

    async function renderPage() {
      // Otherwise the picker's accept filter drops invalid files before validation.
      const user = userEvent.setup({ applyAccept: false });
      renderWithRouter(<HomePage />);
      await screen.findByRole("link", { name: "Weekly sync" });
      return {
        user,
        start: async () => {
          await user.click(
            screen.getByRole("button", { name: "Start recording" }),
          );
          await screen.findByRole("button", { name: "Stop recording" });
        },
        stop: () =>
          user.click(screen.getByRole("button", { name: "Stop recording" })),
        save: () =>
          user.click(
            screen.getByRole("button", { name: "Save and transcribe" }),
          ),
        pick: (file: File) =>
          user.upload(screen.getByLabelText("Audio file"), file),
      };
    }

    const location = () => screen.queryByTestId("location");
    const deferUpload = () => {
      const upload = deferred<typeof uploaded>();
      mockedUpload.mockReturnValue(upload.promise);
      return () => act(async () => upload.resolve(uploaded));
    };

    it("records, saves and opens the new meeting", async () => {
      const confirm = vi.spyOn(window, "confirm");
      const page = await renderPage();

      await page.start();
      await page.stop();
      await page.save();

      expect(await screen.findByTestId("location")).toHaveTextContent("/m/m1");
      expect(confirm).not.toHaveBeenCalled();
      expect(mockedUpload).toHaveBeenCalledWith(expect.any(Blob), "audio/webm");
      expect(createMeeting).toHaveBeenCalledWith(
        expect.objectContaining({ source: "mic", title: undefined }),
      );
      expect(processMeeting).toHaveBeenCalledWith("m1");
      expect(trackStop).toHaveBeenCalled();
    });

    it("shows the upload and create steps while saving", async () => {
      const finishUpload = deferUpload();
      const create = deferred<Meeting>();
      vi.mocked(createMeeting).mockReturnValue(create.promise);
      const page = await renderPage();
      await page.start();
      await page.stop();
      await page.save();

      expect(screen.getByRole("status")).toHaveTextContent("Uploading audio…");
      expect(
        screen.getByRole("button", { name: "Uploading audio…" }),
      ).toHaveAttribute("aria-busy", "true");
      expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();

      await finishUpload();
      expect(screen.getByRole("status")).toHaveTextContent(
        "Creating the meeting…",
      );
      expect(location()).not.toBeInTheDocument();

      await act(async () =>
        create.resolve(meetingFixture({ id: "m1", status: "uploaded" })),
      );
      expect(await screen.findByTestId("location")).toHaveTextContent("/m/m1");
    });

    it("shows a failed save with a retry", async () => {
      vi.mocked(createMeeting).mockRejectedValueOnce(networkDown);
      const page = await renderPage();
      await page.start();
      await page.stop();
      await page.save();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Network down",
      );
      await page.user.click(screen.getByRole("button", { name: "Retry" }));

      expect(await screen.findByTestId("location")).toHaveTextContent("/m/m1");
      expect(mockedUpload).toHaveBeenCalledTimes(1);
    });

    it("forgets a failed save when the recording is discarded", async () => {
      mockedUpload.mockRejectedValueOnce(new Error("offline"));
      const page = await renderPage();
      await page.start();
      await page.stop();
      await page.save();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        /Couldn't upload/,
      );

      await page.user.click(screen.getByRole("button", { name: "Discard" }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Start recording" }),
      ).toBeEnabled();
    });

    it("hides the mic-free options while a recording is unsaved", async () => {
      mockedList.mockResolvedValue([]);
      const user = userEvent.setup();
      renderWithRouter(<HomePage />);
      const meetings = screen.getByRole("region", { name: "Meetings" });
      expect(
        await within(meetings).findByRole("button", {
          name: "Try a 2-minute sample",
        }),
      ).toBeVisible();
      expect(screen.getByText("No microphone?")).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Start recording" }));
      const stop = await screen.findByRole("button", {
        name: "Stop recording",
      });
      expect(screen.queryByText("No microphone?")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /sample/ }),
      ).not.toBeInTheDocument();

      await user.click(stop);

      expect(
        screen.getByRole("button", { name: "Save and transcribe" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: /sample/ }),
      ).not.toBeInTheDocument();
    });

    describe("leaving", () => {
      it("asks before a link leaves an unsaved recording", async () => {
        const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
        const page = await renderPage();
        await page.start();
        const link = screen.getByRole("link", { name: "Weekly sync" });

        await page.user.click(link);

        expect(confirm).toHaveBeenCalledTimes(1);
        expect(location()).not.toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Stop recording" }),
        ).toBeVisible();

        confirm.mockReturnValueOnce(true);
        await page.user.click(link);

        expect(await screen.findByTestId("location")).toHaveTextContent("/m/");
        expect(trackStop).toHaveBeenCalled();
      });

      it("asks before a link leaves a recording that is still saving", async () => {
        const finishUpload = deferUpload();
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
        const page = await renderPage();
        await page.start();
        await page.stop();
        await page.save();

        await page.user.click(
          screen.getByRole("link", { name: "Weekly sync" }),
        );
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(location()).not.toBeInTheDocument();

        await finishUpload();
        expect(await screen.findByTestId("location")).toHaveTextContent(
          "/m/m1",
        );
        expect(confirm).toHaveBeenCalledTimes(1);
      });

      it("leaves without asking when nothing is recorded", async () => {
        const confirm = vi.spyOn(window, "confirm");
        const page = await renderPage();

        await page.user.click(
          screen.getByRole("link", { name: "Weekly sync" }),
        );

        expect(await screen.findByTestId("location")).toHaveTextContent("/m/");
        expect(confirm).not.toHaveBeenCalled();
      });
    });

    describe("feedback from other sources", () => {
      it("drops a failed file upload's retry once a recording starts", async () => {
        mockedUpload.mockRejectedValueOnce(new Error("offline"));
        const page = await renderPage();
        await page.pick(audio);
        expect(await screen.findByRole("alert")).toHaveTextContent(
          /Couldn't upload/,
        );

        await page.start();

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      });

      it("drops a sample still loading once a recording starts", async () => {
        const sample = deferred<unknown>();
        vi.stubGlobal("fetch", () => sample.promise);
        const page = await renderPage();
        await page.user.click(
          screen.getByRole("button", { name: "Try a 2-minute sample" }),
        );

        await page.start();
        await act(async () =>
          sample.resolve({
            ok: true,
            blob: async () => new Blob(["x"], { type: "audio/webm" }),
          }),
        );

        expect(mockedUpload).not.toHaveBeenCalled();
        expect(location()).not.toBeInTheDocument();
      });
    });

    describe("dropping a file", () => {
      it("uploads a dropped audio file and opens the new meeting", async () => {
        await renderPage();

        fireEvent.dragEnter(document.body, drag(audio));
        expect(
          screen.getByText("Drop an audio file to transcribe it"),
        ).toBeVisible();
        fireEvent.drop(document.body, drag(audio));

        expect(await screen.findByTestId("location")).toHaveTextContent(
          "/m/m1",
        );
        expect(mockedUpload).toHaveBeenCalledWith(audio, "audio/mp4");
        expect(createMeeting).toHaveBeenCalledWith(
          expect.objectContaining({ source: "upload", title: undefined }),
        );
      });

      it("explains a rejected drop until a recording starts", async () => {
        const page = await renderPage();

        fireEvent.drop(document.body, drag(text));

        expect(await screen.findByRole("alert")).toHaveTextContent(
          "Choose an audio file (WebM, M4A, MP3, WAV or OGG).",
        );
        expect(mockedUpload).not.toHaveBeenCalled();

        await page.start();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      });

      it("shows the newest file problem, whichever way the file came", async () => {
        mockedUpload.mockRejectedValueOnce(new Error("offline"));
        const page = await renderPage();
        await page.pick(audio);
        expect(await screen.findByRole("alert")).toHaveTextContent(
          /Couldn't upload/,
        );

        fireEvent.drop(document.body, drag(text));
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Choose an audio file",
        );
        expect(
          screen.queryByRole("button", { name: "Retry" }),
        ).not.toBeInTheDocument();

        const big = new File(["x"], "big.mp3", { type: "audio/mpeg" });
        Object.defineProperty(big, "size", { value: MAX_AUDIO_BYTES + 1 });
        await page.pick(big);
        expect(screen.getByRole("alert")).toHaveTextContent(/over 25 MB/);
      });

      it("ignores drops while a recording is running or unsaved", async () => {
        const page = await renderPage();
        await page.start();

        fireEvent.dragEnter(document.body, drag(audio));
        fireEvent.drop(document.body, drag(audio));
        expect(
          screen.queryByText("Drop an audio file to transcribe it"),
        ).not.toBeInTheDocument();

        await page.stop();
        fireEvent.drop(document.body, drag(audio));

        expect(mockedUpload).not.toHaveBeenCalled();
        expect(location()).not.toBeInTheDocument();
      });

      it("ignores drops while a save is running", async () => {
        mockedUpload.mockReturnValue(new Promise(() => {}));
        await renderPage();
        fireEvent.drop(document.body, drag(audio));
        await screen.findByText("Uploading audio…");

        fireEvent.drop(document.body, drag(audio));

        expect(mockedUpload).toHaveBeenCalledTimes(1);
      });
    });
  });
});
