import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { getMeeting, listMeetings } from "@/lib/api";
import { routes } from "@/routes";
import { meetingFixture } from "@/test/fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listMeetings: vi.fn(),
  getMeeting: vi.fn(),
}));

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  vi.mocked(listMeetings).mockResolvedValue([]);
  vi.mocked(getMeeting).mockResolvedValue(meetingFixture());
});

it("routes /m/:id to the meeting page", async () => {
  renderAt("/m/abc");

  expect(
    await screen.findByRole("heading", { level: 1, name: "Weekly sync" }),
  ).toBeInTheDocument();
  expect(getMeeting).toHaveBeenCalledWith("abc");
});

it("shows a titled not-found page that links back to the meetings", async () => {
  const user = userEvent.setup();
  renderAt("/nope");

  expect(
    screen.getByRole("heading", { level: 1, name: "Page not found" }),
  ).toBeInTheDocument();
  expect(document.title).toBe("Page not found – Recap");

  await user.click(screen.getByRole("link", { name: "Back to meetings" }));

  expect(
    await screen.findByRole("heading", { name: "Meetings" }),
  ).toBeInTheDocument();
  expect(document.title).toBe("Recap");
});

it("opens a new page at the top unless the navigation opts out", async () => {
  const scrollTo = vi.spyOn(window, "scrollTo");
  const router = renderAt("/m/abc");
  await screen.findByRole("heading", { level: 1, name: "Weekly sync" });

  scrollTo.mockClear();
  await act(() =>
    router.navigate(
      { pathname: "/m/abc", hash: "#actions" },
      { replace: true, preventScrollReset: true },
    ),
  );
  expect(scrollTo).not.toHaveBeenCalled();

  await act(() => router.navigate("/"));
  expect(scrollTo).toHaveBeenCalledWith(0, 0);
});
