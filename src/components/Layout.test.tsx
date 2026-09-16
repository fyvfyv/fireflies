import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it } from "vitest";
import { Layout } from "./Layout";
import { useToast } from "./ui/Toaster";

function ChildPage() {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toast({ title: "Link copied" })}>
      Copy link
    </button>
  );
}

function renderLayout() {
  const router = createMemoryRouter([
    { element: <Layout />, children: [{ path: "/", element: <ChildPage /> }] },
  ]);
  render(<RouterProvider router={router} />);
}

const notice =
  "Shared demo workspace. Anyone with the link can see recordings.";

it("renders the page in the main landmark under a home link and mounts the toaster", async () => {
  const user = userEvent.setup();
  renderLayout();

  expect(screen.getByRole("link", { name: "Recap" })).toHaveAttribute(
    "href",
    "/",
  );
  const copy = screen.getByRole("button", { name: "Copy link" });
  expect(screen.getByRole("main")).toContainElement(copy);

  await user.click(copy);

  expect(
    screen.getByRole("region", { name: "Notifications" }),
  ).toHaveTextContent("Link copied");
});

it("tells visitors the workspace is shared, with a tap-to-open tooltip on narrow screens", async () => {
  const user = userEvent.setup();
  renderLayout();

  expect(screen.getByText(notice)).toBeInTheDocument();

  const info = screen.getByRole("button", { name: notice });
  await user.click(info);
  expect(await screen.findByRole("tooltip")).toHaveTextContent(notice);
  expect(info).not.toHaveAttribute("aria-describedby");
});

it("has a skip link that moves focus to the content", async () => {
  const user = userEvent.setup();
  renderLayout();

  await user.tab();
  expect(screen.getByRole("link", { name: "Skip to content" })).toHaveFocus();

  await user.keyboard("{Enter}");

  expect(screen.getByRole("main")).toHaveFocus();
});
