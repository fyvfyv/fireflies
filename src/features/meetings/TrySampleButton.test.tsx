import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TrySampleButton } from "./TrySampleButton";

const sampleResponse = (blob: Blob) => ({ ok: true, blob: async () => blob });

function setup(props: { disabled?: boolean } = {}) {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(<TrySampleButton onSubmit={onSubmit} {...props} />);
  const click = () =>
    user.click(screen.getByRole("button", { name: "Try a 2-minute sample" }));
  return { onSubmit, click };
}

describe("TrySampleButton", () => {
  it("submits the bundled sample recording", async () => {
    const fetchMock = vi.fn(async () =>
      sampleResponse(new Blob(["x"], { type: "audio/webm" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { onSubmit, click } = setup();

    await click();

    expect(fetchMock).toHaveBeenCalledWith("/samples/standup.webm", {
      signal: expect.any(AbortSignal),
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const input = onSubmit.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      contentType: "audio/webm",
      source: "demo",
      title: "Sample: weekly standup",
    });
    expect(input.blob).toBeInstanceOf(Blob);
  });

  it("labels the sample as audio whatever type the server sent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sampleResponse(new Blob(["x"], { type: "video/webm" })),
      ),
    );
    const { onSubmit, click } = setup();

    await click();

    expect(onSubmit.mock.calls[0]?.[0].contentType).toBe("audio/webm");
  });

  it("shows an error when the sample can't be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    const { onSubmit, click } = setup();

    await click();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't load the sample/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Try a 2-minute sample" }),
    ).toBeEnabled();
  });

  it("treats an HTML fallback page as a missing sample", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sampleResponse(new Blob(["<!doctype html>"], { type: "text/html" })),
      ),
    );
    const { onSubmit, click } = setup();

    await click();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows an error when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { onSubmit, click } = setup();

    await click();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows it is loading and ignores more clicks", async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const { click } = setup();
    const user = userEvent.setup();

    await click();
    const button = screen.getByRole("button", { name: "Loading sample…" });
    await user.click(button);

    expect(button).toHaveAttribute("aria-busy", "true");
    // Busy rather than disabled, so keyboard focus stays on the button.
    expect(button).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores the second click of a double click that lands on it", () => {
    // The button can appear under the pointer after a double click on the
    // recorder's Discard button.
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const onSubmit = vi.fn();
    render(<TrySampleButton onSubmit={onSubmit} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Try a 2-minute sample" }),
      { detail: 2 },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Try a 2-minute sample" }),
    ).not.toHaveAttribute("aria-busy");
  });

  it("still loads the sample from the keyboard", async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TrySampleButton onSubmit={vi.fn()} />);

    await user.tab();
    await user.keyboard("{Enter}");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops the sample when unmounted while it loads", async () => {
    let finishFetch: (value: unknown) => void = () => {};
    const fetchMock = vi.fn(
      (_url: string, _init: RequestInit) =>
        new Promise((resolve) => {
          finishFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(<TrySampleButton onSubmit={onSubmit} />);
    await user.click(
      screen.getByRole("button", { name: "Try a 2-minute sample" }),
    );

    unmount();
    await act(async () =>
      finishFetch(sampleResponse(new Blob(["x"], { type: "audio/webm" }))),
    );

    expect(fetchMock.mock.calls[0]?.[1].signal?.aborted).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("can be disabled", () => {
    setup({ disabled: true });

    expect(
      screen.getByRole("button", { name: "Try a 2-minute sample" }),
    ).toBeDisabled();
  });
});
