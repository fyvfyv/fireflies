import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Toaster, useToast, useToastOffset } from "./Toaster";
import { TOAST_DURATION_MS, TOAST_EXIT_MS } from "./toastStore";

let counter = 0;

const toastFor = (title: string) =>
  screen.getByText(title).closest("[data-tone]") as HTMLElement;

function ToastButton({
  title,
  tone,
}: {
  title?: string;
  tone?: "default" | "danger";
}) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        counter += 1;
        toast({ title: title ?? `Toast ${counter}`, tone });
      }}
    >
      Notify
    </button>
  );
}

function region() {
  return screen.getByRole("region", { name: "Notifications" });
}

describe("Toaster", () => {
  it("announces toasts in a polite live region", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Toaster />
        <ToastButton title="Link copied" />
      </>,
    );

    expect(region()).toHaveAttribute("aria-live", "polite");
    expect(region()).toBeEmptyDOMElement();

    await user.click(screen.getByRole("button", { name: "Notify" }));

    expect(region()).toHaveTextContent("Link copied");
  });

  it("dismisses a toast after 3.5 seconds", async () => {
    vi.useFakeTimers();
    render(
      <>
        <Toaster />
        <ToastButton title="Notes copied" />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notify" }));
    expect(screen.getByText("Notes copied")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(3400));
    expect(screen.getByText("Notes copied")).toBeInTheDocument();

    // The exit animation runs before the toast leaves the DOM.
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(screen.queryByText("Notes copied")).not.toBeInTheDocument();
  });

  it("keeps an error on screen for 10 seconds", async () => {
    vi.useFakeTimers();
    render(
      <>
        <Toaster />
        <ToastButton title="Could not copy" tone="danger" />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notify" }));

    await act(() => vi.advanceTimersByTimeAsync(3500));
    expect(screen.getByText("Could not copy")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(6400));
    expect(screen.getByText("Could not copy")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(100 + TOAST_EXIT_MS));
    expect(screen.queryByText("Could not copy")).not.toBeInTheDocument();
  });

  it("holds a toast while the pointer is over it", async () => {
    vi.useFakeTimers();
    render(
      <>
        <Toaster />
        <ToastButton title="Notes copied" />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Notify" }));
    const item = toastFor("Notes copied");

    await act(() => vi.advanceTimersByTimeAsync(1000));
    fireEvent.pointerEnter(item);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByText("Notes copied")).toBeInTheDocument();

    // The countdown resumes where it stopped: 2.5s were left.
    fireEvent.pointerLeave(item);
    await act(() => vi.advanceTimersByTimeAsync(2400));
    expect(screen.getByText("Notes copied")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(100 + TOAST_EXIT_MS));
    expect(screen.queryByText("Notes copied")).not.toBeInTheDocument();
  });

  it("holds a toast while focus is inside it", async () => {
    vi.useFakeTimers();
    render(
      <>
        <Toaster />
        <ToastButton title="Link copied" />
        <button type="button">Elsewhere</button>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Notify" }));
    const dismiss = screen.getByRole("button", {
      name: "Dismiss notification",
    });

    act(() => dismiss.focus());
    await act(() => vi.advanceTimersByTimeAsync(TOAST_DURATION_MS + 1000));
    expect(screen.getByText("Link copied")).toBeInTheDocument();

    act(() => screen.getByRole("button", { name: "Elsewhere" }).focus());
    await act(() =>
      vi.advanceTimersByTimeAsync(TOAST_DURATION_MS + TOAST_EXIT_MS),
    );
    expect(screen.queryByText("Link copied")).not.toBeInTheDocument();
  });

  it("stays paused when the pointer leaves a toast that still has focus", async () => {
    vi.useFakeTimers();
    render(
      <>
        <Toaster />
        <ToastButton title="Link copied" />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Notify" }));
    const item = toastFor("Link copied");

    fireEvent.pointerEnter(item);
    act(() =>
      screen.getByRole("button", { name: "Dismiss notification" }).focus(),
    );
    fireEvent.pointerLeave(item);
    await act(() => vi.advanceTimersByTimeAsync(TOAST_DURATION_MS + 1000));

    expect(screen.getByText("Link copied")).toBeInTheDocument();
  });

  it("stays paused when focus leaves a toast the pointer is still over", async () => {
    vi.useFakeTimers();
    render(
      <>
        <Toaster />
        <ToastButton title="Link copied" />
        <button type="button">Elsewhere</button>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Notify" }));
    const item = toastFor("Link copied");

    fireEvent.pointerEnter(item);
    act(() =>
      screen.getByRole("button", { name: "Dismiss notification" }).focus(),
    );
    act(() => screen.getByRole("button", { name: "Elsewhere" }).focus());
    await act(() => vi.advanceTimersByTimeAsync(TOAST_DURATION_MS + 1000));
    expect(screen.getByText("Link copied")).toBeInTheDocument();

    // Once the pointer leaves too, the countdown resumes.
    fireEvent.pointerLeave(item);
    await act(() =>
      vi.advanceTimersByTimeAsync(TOAST_DURATION_MS + TOAST_EXIT_MS),
    );
    expect(screen.queryByText("Link copied")).not.toBeInTheDocument();
  });

  it("keeps at most three toasts, dropping the oldest", () => {
    render(
      <>
        <Toaster />
        <ToastButton />
      </>,
    );
    const start = counter;
    const button = screen.getByRole("button", { name: "Notify" });

    for (let i = 0; i < 4; i += 1) fireEvent.click(button);

    expect(screen.queryByText(`Toast ${start + 1}`)).not.toBeInTheDocument();
    for (const n of [2, 3, 4]) {
      expect(screen.getByText(`Toast ${start + n}`)).toBeInTheDocument();
    }
  });

  it("marks danger toasts", () => {
    render(
      <>
        <Toaster />
        <ToastButton title="Could not copy" tone="danger" />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notify" }));

    expect(
      screen.getByText("Could not copy").closest("[data-tone]"),
    ).toHaveAttribute("data-tone", "danger");
  });

  it("closes a toast from its dismiss button", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Toaster />
        <ToastButton title="Link copied" />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Notify" }));
    await user.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );

    await waitFor(() =>
      expect(screen.queryByText("Link copied")).not.toBeInTheDocument(),
    );
  });

  it("lifts toasts by the offset prop", () => {
    render(<Toaster offset={80} />);

    expect(region().style.getPropertyValue("--toast-offset")).toBe("80px");
  });

  it("lets a mounted page lift toasts while it is shown", async () => {
    function Lifted() {
      useToastOffset(96);
      return null;
    }
    function Page() {
      const [shown, setShown] = useState(true);
      return (
        <>
          {shown && <Lifted />}
          <button type="button" onClick={() => setShown(false)}>
            Leave
          </button>
        </>
      );
    }
    const user = userEvent.setup();
    render(
      <>
        <Toaster offset={8} />
        <Page />
      </>,
    );

    expect(region().style.getPropertyValue("--toast-offset")).toBe("96px");

    await user.click(screen.getByRole("button", { name: "Leave" }));

    expect(region().style.getPropertyValue("--toast-offset")).toBe("8px");
  });

  it("does not throw when no Toaster is mounted", async () => {
    const user = userEvent.setup();
    render(<ToastButton title="Nobody sees this" />);

    await user.click(screen.getByRole("button", { name: "Notify" }));

    expect(screen.queryByText("Nobody sees this")).not.toBeInTheDocument();
  });
});
