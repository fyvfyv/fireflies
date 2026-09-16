import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMeeting, listMeetings } from "@/lib/api";
import { routes } from "@/routes";
import { meetingFixture, meetingListItemFixture } from "@/test/fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listMeetings: vi.fn(),
  getMeeting: vi.fn(),
}));

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { router, ...render(<RouterProvider router={router} />) };
}

beforeEach(() => {
  vi.mocked(listMeetings).mockReset().mockResolvedValue([]);
  vi.mocked(getMeeting).mockReset().mockResolvedValue(meetingFixture());
  // Unmounted pages restore "Recap", so start from a title no page sets.
  document.title = "";
});

describe("routes", () => {
  it("renders the home page inside the layout", async () => {
    renderAt("/");

    expect(screen.getByRole("link", { name: "Recap" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByText(/shared demo workspace/i)).toBeVisible();
    expect(
      await screen.findByRole("heading", { name: "Meetings" }),
    ).toBeInTheDocument();
    expect(document.title).toBe("Recap");
  });

  it("routes /m/:id to the meeting page", async () => {
    renderAt("/m/abc");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Weekly sync" }),
    ).toBeInTheDocument();
    expect(getMeeting).toHaveBeenCalledWith("abc");
    expect(listMeetings).not.toHaveBeenCalled();
  });

  it("renders a not-found empty state for unknown paths", () => {
    renderAt("/nope");

    const main = screen.getByRole("main");
    expect(
      within(main).getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
    expect(within(main).getByText(/link may be broken/i)).toBeInTheDocument();
    expect(
      within(main).getByRole("link", { name: "Back to meetings" }),
    ).toHaveAttribute("href", "/");
    expect(listMeetings).not.toHaveBeenCalled();
    expect(document.title).toBe("Page not found – Recap");
  });

  it("gives the tab back its app title when leaving the not-found page", async () => {
    const user = userEvent.setup();
    renderAt("/nope");
    expect(document.title).toBe("Page not found – Recap");

    await user.click(screen.getByRole("link", { name: "Back to meetings" }));

    await screen.findByRole("heading", { name: "Meetings" });
    expect(document.title).toBe("Recap");
  });

  describe("scroll position", () => {
    it("opens a new page at the top", async () => {
      vi.mocked(listMeetings).mockResolvedValue([
        meetingListItemFixture({ id: "abc", title: "Pricing call" }),
      ]);
      const user = userEvent.setup();
      const scrollTo = vi.spyOn(window, "scrollTo");
      renderAt("/");
      const row = await screen.findByRole("link", { name: "Pricing call" });
      scrollTo.mockClear();

      await user.click(row);

      expect(
        await screen.findByRole("heading", { level: 1, name: "Weekly sync" }),
      ).toBeInTheDocument();
      expect(scrollTo).toHaveBeenCalledWith(0, 0);
    });

    it("stays put when a navigation opts out of the reset", async () => {
      const scrollTo = vi.spyOn(window, "scrollTo");
      const { router } = renderAt("/m/abc");
      await screen.findByRole("heading", { level: 1, name: "Weekly sync" });
      scrollTo.mockClear();

      // How the meeting page's hash tabs navigate.
      await act(() =>
        router.navigate(
          { pathname: "/m/abc", hash: "#actions" },
          { replace: true, preventScrollReset: true },
        ),
      );

      expect(router.state.location.hash).toBe("#actions");
      expect(scrollTo).not.toHaveBeenCalled();
    });
  });
});
