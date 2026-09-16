import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TrySampleButton } from "./TrySampleButton";

const sampleResponse = (type: string) => ({
  ok: true,
  blob: async () => new Blob(["x"], { type }),
});

function setup(fetchImpl: (url: string, init: RequestInit) => unknown) {
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal("fetch", fetchMock);
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  const view = render(<TrySampleButton onSubmit={onSubmit} />);
  const button = () => screen.getByRole("button", { name: /sample/ });
  return { ...view, fetchMock, onSubmit, user, button };
}

const never = () => new Promise(() => {});

describe("TrySampleButton", () => {
  it("submits the bundled sample as audio, whatever type the server sent", async () => {
    const { fetchMock, onSubmit, user, button } = setup(async () =>
      sampleResponse("video/webm"),
    );

    await user.click(button());

    expect(fetchMock).toHaveBeenCalledWith("/samples/standup.webm", {
      signal: expect.any(AbortSignal),
    });
    expect(onSubmit).toHaveBeenCalledWith({
      blob: expect.any(Blob),
      contentType: "audio/webm",
      source: "demo",
      title: "Sample: weekly standup",
    });
  });

  it.each([
    ["an error status", async () => ({ ok: false, status: 404 })],
    ["the SPA's HTML fallback", async () => sampleResponse("text/html")],
    [
      "a network error",
      async () => {
        throw new TypeError("Failed to fetch");
      },
    ],
  ])("reports a missing sample on %s", async (_case, fetchImpl) => {
    const { onSubmit, user, button } = setup(fetchImpl);

    await user.click(button());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load the sample recording. Please try again.",
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(button()).toBeEnabled();
  });

  it("stays focused and busy while loading, ignoring more clicks", async () => {
    const { fetchMock, user, button } = setup(never);

    await user.click(button());
    await user.click(button());

    expect(button()).toHaveAccessibleName("Loading sample…");
    expect(button()).toHaveAttribute("aria-busy", "true");
    expect(button()).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores the second click of a double click, but not the keyboard", async () => {
    const { fetchMock, user, button } = setup(never);

    fireEvent.click(button(), { detail: 2 });
    expect(fetchMock).not.toHaveBeenCalled();

    await user.tab();
    await user.keyboard("{Enter}");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops the sample when unmounted while it loads", async () => {
    let finishFetch: (value: unknown) => void = () => {};
    const { fetchMock, onSubmit, user, button, unmount } = setup(
      () =>
        new Promise((resolve) => {
          finishFetch = resolve;
        }),
    );
    await user.click(button());

    unmount();
    await act(async () => finishFetch(sampleResponse("audio/webm")));

    expect(fetchMock.mock.calls[0]?.[1].signal?.aborted).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
