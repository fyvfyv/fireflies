import { MAX_AUDIO_BYTES } from "@shared/constants";
import type { Meeting, MeetingListItem, MeetingStatus } from "@shared/schemas";
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

const transcribing = meetingListItemFixture({
  id: "t1",
  title: "In flight",
  status: "transcribing",
  overviewSnippet: null,
  actionItemCount: 0,
});

beforeEach(() => {
  mockedList.mockReset();
});

describe("HomePage", () => {
  it("renders meetings from the API", async () => {
    mockedList.mockResolvedValue([meetingListItemFixture()]);

    renderWithRouter(<HomePage />);

    expect(
      await screen.findByRole("link", { name: /Weekly sync/ }),
    ).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it("leads with the hero and the recorder", async () => {
    mockedList.mockResolvedValue([]);

    renderWithRouter(<HomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /Record the meeting/ }),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "Recorder" })).toBeVisible();
    expect(await screen.findByText("No meetings yet")).toBeInTheDocument();
  });

  it("shows skeleton rows until the list loads", async () => {
    let resolve: (value: MeetingListItem[]) => void = () => {};
    mockedList.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );

    renderWithRouter(<HomePage />);

    expect(screen.getByText("Loading meetings…")).toBeInTheDocument();
    await act(async () => resolve([meetingListItemFixture()]));
    expect(screen.queryByText("Loading meetings…")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Weekly sync" })).toBeVisible();
  });

  describe("polling", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    it.each(["transcribing", "transcribed", "summarizing"] as const)(
      "refetches every 5 s while a meeting is %s",
      async (status) => {
        mockedList.mockResolvedValue([{ ...transcribing, status }]);

        renderWithRouter(<HomePage />);
        await screen.findByText("In flight");
        expect(mockedList).toHaveBeenCalledTimes(1);

        await act(() => vi.advanceTimersByTimeAsync(5_000));
        expect(mockedList).toHaveBeenCalledTimes(2);

        await act(() => vi.advanceTimersByTimeAsync(5_000));
        expect(mockedList).toHaveBeenCalledTimes(3);
      },
    );

    it.each(["uploaded", "done", "failed"] as MeetingStatus[])(
      "does not poll for a %s meeting",
      async (status) => {
        mockedList.mockResolvedValue([{ ...transcribing, status }]);

        renderWithRouter(<HomePage />);
        await screen.findByText("In flight");

        await act(() => vi.advanceTimersByTimeAsync(10_000));
        expect(mockedList).toHaveBeenCalledTimes(1);
      },
    );

    it("stops once nothing is processing", async () => {
      mockedList
        .mockResolvedValueOnce([transcribing])
        .mockResolvedValue([{ ...transcribing, status: "done" }]);

      renderWithRouter(<HomePage />);
      await screen.findByText("In flight");

      await act(() => vi.advanceTimersByTimeAsync(5_000));
      expect(await screen.findByText("Done")).toBeInTheDocument();

      await act(() => vi.advanceTimersByTimeAsync(15_000));
      expect(mockedList).toHaveBeenCalledTimes(2);
    });

    it("does not poll when the only in-progress row is stalled", async () => {
      mockedList.mockResolvedValue([{ ...transcribing, stalled: true }]);

      renderWithRouter(<HomePage />);
      await screen.findByText("Interrupted");

      await act(() => vi.advanceTimersByTimeAsync(10_000));
      expect(mockedList).toHaveBeenCalledTimes(1);
    });

    it("keeps polling through a failed refetch", async () => {
      mockedList
        .mockResolvedValueOnce([transcribing])
        .mockRejectedValueOnce(
          new ApiError({
            status: 0,
            code: "network",
            message: "Network down",
            retryable: true,
          }),
        )
        .mockResolvedValue([transcribing]);

      renderWithRouter(<HomePage />);
      await screen.findByText("In flight");

      await act(() => vi.advanceTimersByTimeAsync(5_000));
      expect(screen.getByRole("alert")).toHaveTextContent("Network down");
      expect(screen.getByText("In flight")).toBeInTheDocument();

      await act(() => vi.advanceTimersByTimeAsync(5_000));
      expect(mockedList).toHaveBeenCalledTimes(3);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("shows a load error with a retry", async () => {
    mockedList
      .mockRejectedValueOnce(
        new ApiError({
          status: 500,
          code: "internal",
          message: "Database unavailable",
          retryable: true,
        }),
      )
      .mockResolvedValue([meetingListItemFixture()]);
    const user = userEvent.setup();

    renderWithRouter(<HomePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("link", { name: /Weekly sync/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  describe("recording", () => {
    const trackStop = vi.fn();

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
      vi.mocked(uploadAudio).mockReset().mockResolvedValue({
        pathname: "recordings/u1.webm",
        sizeBytes: 1,
        contentType: "audio/webm",
      });
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

    async function recordAndSave() {
      const user = userEvent.setup();
      renderWithRouter(<HomePage />);
      await user.click(
        await screen.findByRole("button", { name: "Start recording" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "Stop recording" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Save and transcribe" }),
      );
      return user;
    }

    it("records, saves and opens the new meeting", async () => {
      const confirm = vi.spyOn(window, "confirm");
      await recordAndSave();

      expect(await screen.findByTestId("location")).toHaveTextContent("/m/m1");
      expect(confirm).not.toHaveBeenCalled();
      expect(uploadAudio).toHaveBeenCalledWith(expect.any(Blob), "audio/webm");
      expect(createMeeting).toHaveBeenCalledWith(
        expect.objectContaining({ source: "mic", title: undefined }),
      );
      expect(processMeeting).toHaveBeenCalledWith("m1");
      expect(trackStop).toHaveBeenCalled();
    });

    it("uploads an audio file and opens the new meeting", async () => {
      const user = userEvent.setup();
      renderWithRouter(<HomePage />);
      const file = new File(["x"], "call.m4a", { type: "audio/mp4" });

      expect(await screen.findByText("No microphone?")).toBeVisible();
      await user.upload(screen.getByLabelText("Audio file"), file);

      expect(await screen.findByTestId("location")).toHaveTextContent("/m/m1");
      expect(uploadAudio).toHaveBeenCalledWith(file, "audio/mp4");
      expect(createMeeting).toHaveBeenCalledWith(
        expect.objectContaining({ source: "upload", title: undefined }),
      );
    });

    it("offers the mic-free options in the empty state", async () => {
      mockedList.mockResolvedValue([]);

      renderWithRouter(<HomePage />);

      const meetings = screen.getByRole("region", { name: "Meetings" });
      expect(
        await within(meetings).findByText("No meetings yet"),
      ).toBeVisible();
      expect(
        within(meetings).getByRole("button", { name: "Try a 2-minute sample" }),
      ).toBeVisible();
    });

    describe("dropping a file", () => {
      const audio = new File(["x"], "call.m4a", { type: "audio/mp4" });
      const drag = (file: File) => ({
        dataTransfer: { types: ["Files"], files: [file], dropEffect: "none" },
      });

      it("uploads a dropped audio file and opens the new meeting", async () => {
        renderWithRouter(<HomePage />);
        await screen.findByRole("link", { name: "Weekly sync" });

        fireEvent.dragEnter(document.body, drag(audio));
        expect(
          screen.getByText("Drop an audio file to transcribe it"),
        ).toBeVisible();
        fireEvent.drop(document.body, drag(audio));

        expect(await screen.findByTestId("location")).toHaveTextContent(
          "/m/m1",
        );
        expect(uploadAudio).toHaveBeenCalledWith(audio, "audio/mp4");
        expect(createMeeting).toHaveBeenCalledWith(
          expect.objectContaining({ source: "upload" }),
        );
      });

      it("explains why a dropped file can't be used", async () => {
        const user = userEvent.setup();
        renderWithRouter(<HomePage />);
        await screen.findByRole("link", { name: "Weekly sync" });

        fireEvent.drop(
          document.body,
          drag(new File(["x"], "notes.txt", { type: "text/plain" })),
        );

        expect(await screen.findByRole("alert")).toHaveTextContent(
          "Choose an audio file (WebM, M4A, MP3, WAV or OGG).",
        );
        expect(uploadAudio).not.toHaveBeenCalled();

        // Starting a recording clears the message.
        await user.click(
          screen.getByRole("button", { name: "Start recording" }),
        );
        await screen.findByRole("button", { name: "Stop recording" });
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      });

      it("replaces a failed save with the dropped file's problem", async () => {
        vi.mocked(uploadAudio).mockRejectedValueOnce(new Error("offline"));
        const user = userEvent.setup();
        renderWithRouter(<HomePage />);
        await screen.findByRole("link", { name: "Weekly sync" });
        await user.upload(screen.getByLabelText("Audio file"), audio);
        expect(await screen.findByRole("alert")).toHaveTextContent(
          /Couldn't upload/,
        );

        fireEvent.drop(
          document.body,
          drag(new File(["x"], "notes.txt", { type: "text/plain" })),
        );

        expect(screen.getByRole("alert")).toHaveTextContent(
          "Choose an audio file (WebM, M4A, MP3, WAV or OGG).",
        );
        expect(
          screen.queryByRole("button", { name: "Retry" }),
        ).not.toBeInTheDocument();
      });

      it("drops an old drop message when a picked file is rejected", async () => {
        // The picker's accept filter would drop the file before validation.
        const user = userEvent.setup({ applyAccept: false });
        renderWithRouter(<HomePage />);
        await screen.findByRole("link", { name: "Weekly sync" });
        fireEvent.drop(
          document.body,
          drag(new File(["x"], "notes.txt", { type: "text/plain" })),
        );
        expect(await screen.findByRole("alert")).toBeInTheDocument();

        const big = new File(["x"], "big.mp3", { type: "audio/mpeg" });
        Object.defineProperty(big, "size", { value: MAX_AUDIO_BYTES + 1 });
        await user.upload(screen.getByLabelText("Audio file"), big);

        expect(screen.getByRole("alert")).toHaveTextContent(/over 25 MB/);
      });

      it("ignores drops while a recording is in progress", async () => {
        const user = userEvent.setup();
        renderWithRouter(<HomePage />);
        await user.click(
          await screen.findByRole("button", { name: "Start recording" }),
        );
        await screen.findByRole("button", { name: "Stop recording" });

        fireEvent.dragEnter(document.body, drag(audio));
        fireEvent.drop(document.body, drag(audio));

        expect(
          screen.queryByText("Drop an audio file to transcribe it"),
        ).not.toBeInTheDocument();
        expect(uploadAudio).not.toHaveBeenCalled();
      });

      it("ignores drops while an unsaved recording waits", async () => {
        const user = userEvent.setup();
        renderWithRouter(<HomePage />);
        await user.click(
          await screen.findByRole("button", { name: "Start recording" }),
        );
        await user.click(
          await screen.findByRole("button", { name: "Stop recording" }),
        );

        fireEvent.drop(document.body, drag(audio));

        expect(uploadAudio).not.toHaveBeenCalled();
        expect(screen.queryByTestId("location")).not.toBeInTheDocument();
      });

      it("ignores drops while a save is running", async () => {
        vi.mocked(uploadAudio).mockReturnValue(new Promise(() => {}));
        renderWithRouter(<HomePage />);
        await screen.findByRole("link", { name: "Weekly sync" });
        fireEvent.drop(document.body, drag(audio));
        await screen.findByText("Uploading audio…");

        fireEvent.drop(document.body, drag(audio));

        expect(uploadAudio).toHaveBeenCalledTimes(1);
      });
    });

    it("hides the mic-free options while recording", async () => {
      const user = userEvent.setup();
      renderWithRouter(<HomePage />);

      await user.click(
        await screen.findByRole("button", { name: "Start recording" }),
      );
      await screen.findByRole("button", { name: "Stop recording" });

      expect(screen.queryByText("No microphone?")).not.toBeInTheDocument();
    });

    it("shows the upload and create steps while saving", async () => {
      let finishUpload: (
        value: Awaited<ReturnType<typeof uploadAudio>>,
      ) => void = () => {};
      vi.mocked(uploadAudio).mockReturnValue(
        new Promise((resolve) => {
          finishUpload = resolve;
        }),
      );

      await recordAndSave();

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Uploading audio…",
      );
      expect(
        screen.getByRole("button", { name: "Uploading audio…" }),
      ).toHaveAttribute("aria-busy", "true");
      expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();

      let finishCreate: (value: Meeting) => void = () => {};
      vi.mocked(createMeeting).mockReturnValue(
        new Promise((resolve) => {
          finishCreate = resolve;
        }),
      );
      await act(async () =>
        finishUpload({
          pathname: "recordings/u1.webm",
          sizeBytes: 1,
          contentType: "audio/webm",
        }),
      );

      expect(screen.getByRole("status")).toHaveTextContent(
        "Creating the meeting…",
      );
      expect(
        screen.getByRole("button", { name: "Creating the meeting…" }),
      ).toHaveAttribute("aria-busy", "true");
      expect(screen.queryByTestId("location")).not.toBeInTheDocument();

      await act(async () =>
        finishCreate(meetingFixture({ id: "m1", status: "uploaded" })),
      );
      expect(await screen.findByTestId("location")).toHaveTextContent("/m/m1");
    });

    it("hides the mic-free options while an unsaved recording waits", async () => {
      const user = userEvent.setup();
      renderWithRouter(<HomePage />);
      await user.click(
        await screen.findByRole("button", { name: "Start recording" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "Stop recording" }),
      );

      expect(
        await screen.findByRole("button", { name: "Save and transcribe" }),
      ).toBeVisible();
      expect(screen.queryByText("No microphone?")).not.toBeInTheDocument();
    });

    it("asks before a link leaves an unsaved recording", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
      const user = userEvent.setup();
      renderWithRouter(<HomePage />);
      await user.click(
        await screen.findByRole("button", { name: "Start recording" }),
      );
      await screen.findByRole("button", { name: "Stop recording" });

      await user.click(screen.getByRole("link", { name: /Weekly sync/ }));

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("location")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Stop recording" }),
      ).toBeVisible();

      confirm.mockReturnValueOnce(true);
      await user.click(screen.getByRole("link", { name: /Weekly sync/ }));

      expect(await screen.findByTestId("location")).toHaveTextContent("/m/");
      expect(trackStop).toHaveBeenCalled();
    });

    it("asks before a link leaves a recording that is still saving", async () => {
      let finishUpload: (
        value: Awaited<ReturnType<typeof uploadAudio>>,
      ) => void = () => {};
      vi.mocked(uploadAudio).mockReturnValue(
        new Promise((resolve) => {
          finishUpload = resolve;
        }),
      );
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

      const user = await recordAndSave();
      expect(await screen.findByRole("status")).toHaveTextContent(
        "Uploading audio…",
      );
      await user.click(screen.getByRole("link", { name: /Weekly sync/ }));

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("location")).not.toBeInTheDocument();
      await act(async () =>
        finishUpload({
          pathname: "recordings/u1.webm",
          sizeBytes: 1,
          contentType: "audio/webm",
        }),
      );
      expect(await screen.findByTestId("location")).toHaveTextContent("/m/m1");
      expect(confirm).toHaveBeenCalledTimes(1);
    });

    it("drops a failed file upload's retry once a recording starts", async () => {
      vi.mocked(uploadAudio).mockRejectedValueOnce(new Error("offline"));
      const user = userEvent.setup();
      renderWithRouter(<HomePage />);
      const file = new File(["x"], "call.m4a", { type: "audio/mp4" });
      await screen.findByText("No microphone?");
      await user.upload(screen.getByLabelText("Audio file"), file);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        /Couldn't upload/,
      );

      await user.click(screen.getByRole("button", { name: "Start recording" }));
      await screen.findByRole("button", { name: "Stop recording" });

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Retry" }),
      ).not.toBeInTheDocument();
    });

    it("drops a sample still loading once a recording starts", async () => {
      let finishFetch: (value: unknown) => void = () => {};
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise((resolve) => {
              finishFetch = resolve;
            }),
        ),
      );
      const user = userEvent.setup();
      renderWithRouter(<HomePage />);
      await user.click(
        await screen.findByRole("button", { name: "Try a 2-minute sample" }),
      );

      await user.click(screen.getByRole("button", { name: "Start recording" }));
      await screen.findByRole("button", { name: "Stop recording" });
      await act(async () =>
        finishFetch({
          ok: true,
          blob: async () => new Blob(["x"], { type: "audio/webm" }),
        }),
      );

      expect(uploadAudio).not.toHaveBeenCalled();
      expect(screen.queryByTestId("location")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Stop recording" }),
      ).toBeVisible();
    });

    it("leaves without asking when nothing is recorded", async () => {
      const confirm = vi.spyOn(window, "confirm");
      const user = userEvent.setup();
      renderWithRouter(<HomePage />);

      await user.click(
        await screen.findByRole("link", { name: /Weekly sync/ }),
      );

      expect(await screen.findByTestId("location")).toHaveTextContent("/m/");
      expect(confirm).not.toHaveBeenCalled();
    });

    it("forgets a failed save when the recording is discarded", async () => {
      vi.mocked(uploadAudio).mockRejectedValueOnce(new Error("offline"));

      const user = await recordAndSave();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        /Couldn't upload/,
      );
      await user.click(screen.getByRole("button", { name: "Discard" }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Start recording" }),
      ).toBeEnabled();
      expect(uploadAudio).toHaveBeenCalledTimes(1);
    });

    it("shows a failed save with a retry", async () => {
      vi.mocked(createMeeting).mockRejectedValueOnce(
        new ApiError({
          status: 429,
          code: "rate_limited",
          message: "Too many recordings in the last hour.",
          retryable: true,
        }),
      );

      const user = await recordAndSave();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Too many recordings in the last hour.",
      );
      await user.click(screen.getByRole("button", { name: "Retry" }));
      expect(await screen.findByTestId("location")).toHaveTextContent("/m/m1");
      expect(uploadAudio).toHaveBeenCalledTimes(1);
    });
  });

  it("explains when the browser can't record", async () => {
    mockedList.mockResolvedValue([]);

    renderWithRouter(<HomePage />);

    expect(
      await screen.findByText("Recording isn't available in this browser"),
    ).toBeInTheDocument();
    // Offered once, inside the recorder card.
    expect(
      screen.getAllByRole("button", { name: "Try a 2-minute sample" }),
    ).toHaveLength(1);
  });
});
