import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.mocked(listMeetings).mockReset().mockResolvedValue([]);
  vi.mocked(getMeeting).mockReset().mockResolvedValue(meetingFixture());
});

describe("routes", () => {
  it("renders the home page inside the layout", async () => {
    renderAt("/");

    expect(screen.getByRole("link", { name: "Recap" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByText(/shared public demo workspace/i)).toBeVisible();
    expect(
      await screen.findByRole("heading", { name: "Meetings" }),
    ).toBeInTheDocument();
  });

  it("routes /m/:id to the meeting page", async () => {
    renderAt("/m/abc");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Weekly sync" }),
    ).toBeInTheDocument();
    expect(getMeeting).toHaveBeenCalledWith("abc");
    expect(listMeetings).not.toHaveBeenCalled();
  });

  it("renders a not-found page for unknown paths", () => {
    renderAt("/nope");

    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All meetings/ })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
