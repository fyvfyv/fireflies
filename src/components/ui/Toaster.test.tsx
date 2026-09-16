import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster, useToastOffset } from "./Toaster";
import { TOAST_DURATION_MS, TOAST_EXIT_MS, toast } from "./toastStore";

const show = (title: string, tone?: "danger") =>
  act(() => {
    toast({ title, tone });
  });
const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const toastFor = (title: string) =>
  screen.getByText(title).closest("[data-tone]") as HTMLElement;
const region = () => screen.getByRole("region", { name: "Notifications" });
const focus = (element: HTMLElement) => act(() => element.focus());

describe("Toaster", () => {
  describe("countdown", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      render(
        <>
          <Toaster />
          <button type="button">Elsewhere</button>
        </>,
      );
    });

    it("announces a toast and removes it after 3.5 seconds", async () => {
      expect(region()).toHaveAttribute("aria-live", "polite");
      show("Notes copied");
      expect(region()).toHaveTextContent("Notes copied");

      await wait(TOAST_DURATION_MS - 100);
      expect(screen.getByText("Notes copied")).toBeInTheDocument();

      await wait(100 + TOAST_EXIT_MS);
      expect(screen.queryByText("Notes copied")).not.toBeInTheDocument();
    });

    it("keeps an error on screen for 10 seconds", async () => {
      show("Could not copy", "danger");
      expect(toastFor("Could not copy")).toHaveAttribute("data-tone", "danger");

      await wait(9900);
      expect(screen.getByText("Could not copy")).toBeInTheDocument();

      await wait(100 + TOAST_EXIT_MS);
      expect(screen.queryByText("Could not copy")).not.toBeInTheDocument();
    });

    it("holds a toast under the pointer and resumes with the time it had left", async () => {
      show("Notes copied");
      await wait(1000);
      fireEvent.pointerEnter(toastFor("Notes copied"));
      await wait(5000);
      expect(screen.getByText("Notes copied")).toBeInTheDocument();

      fireEvent.pointerLeave(toastFor("Notes copied"));
      await wait(2400);
      expect(screen.getByText("Notes copied")).toBeInTheDocument();
      await wait(100 + TOAST_EXIT_MS);
      expect(screen.queryByText("Notes copied")).not.toBeInTheDocument();
    });

    it("holds a toast while focus is inside it", async () => {
      show("Link copied");
      focus(screen.getByRole("button", { name: "Dismiss notification" }));
      await wait(TOAST_DURATION_MS + 1000);
      expect(screen.getByText("Link copied")).toBeInTheDocument();

      focus(screen.getByRole("button", { name: "Elsewhere" }));
      await wait(TOAST_DURATION_MS + TOAST_EXIT_MS);
      expect(screen.queryByText("Link copied")).not.toBeInTheDocument();
    });

    it("stays held while either the pointer or focus is still on it", async () => {
      show("Link copied");
      const item = toastFor("Link copied");
      const dismiss = screen.getByRole("button", {
        name: "Dismiss notification",
      });

      fireEvent.pointerEnter(item);
      focus(dismiss);
      fireEvent.pointerLeave(item);
      await wait(TOAST_DURATION_MS + 1000);
      expect(screen.getByText("Link copied")).toBeInTheDocument();

      fireEvent.pointerEnter(item);
      focus(screen.getByRole("button", { name: "Elsewhere" }));
      await wait(TOAST_DURATION_MS + 1000);
      expect(screen.getByText("Link copied")).toBeInTheDocument();

      fireEvent.pointerLeave(item);
      await wait(TOAST_DURATION_MS + TOAST_EXIT_MS);
      expect(screen.queryByText("Link copied")).not.toBeInTheDocument();
    });
  });

  it("keeps at most three toasts, dropping the oldest", () => {
    render(<Toaster />);

    for (const n of [1, 2, 3, 4]) show(`Toast ${n}`);

    expect(screen.queryByText("Toast 1")).not.toBeInTheDocument();
    expect(region()).toHaveTextContent("Toast 2Toast 3Toast 4");
  });

  it("closes a toast from its dismiss button", async () => {
    const user = userEvent.setup();
    render(<Toaster />);
    show("Link copied");

    await user.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );

    await waitFor(() =>
      expect(screen.queryByText("Link copied")).not.toBeInTheDocument(),
    );
  });

  it("lifts toasts while a page asks for it", () => {
    function Lifted() {
      useToastOffset(96);
      return null;
    }
    const { rerender } = render(
      <>
        <Toaster />
        <Lifted />
      </>,
    );
    const offset = () => region().style.getPropertyValue("--toast-offset");
    expect(offset()).toBe("96px");

    rerender(<Toaster />);

    expect(offset()).toBe("0px");
  });
});
