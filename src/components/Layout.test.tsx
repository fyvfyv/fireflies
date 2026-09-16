import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { Layout } from "./Layout";
import { useToast } from "./ui/Toaster";
import { Tooltip } from "./ui/Tooltip";

function ChildPage() {
  const { toast } = useToast();
  return (
    <div>
      <h1>Child page</h1>
      <Tooltip content="Explains the button">
        <button type="button" onClick={() => toast({ title: "Link copied" })}>
          Copy link
        </button>
      </Tooltip>
    </div>
  );
}

function renderLayout() {
  const router = createMemoryRouter(
    [
      {
        element: <Layout />,
        children: [{ path: "/", element: <ChildPage /> }],
      },
    ],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

const notice =
  "Shared demo workspace. Anyone with the link can see recordings.";

describe("Layout", () => {
  it("renders the wordmark as a link home", () => {
    renderLayout();

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Recap" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("renders the page inside the main landmark", () => {
    renderLayout();

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "content");
    expect(main).toContainElement(
      screen.getByRole("heading", { name: "Child page" }),
    );
  });

  it("tells visitors the workspace is shared", async () => {
    const user = userEvent.setup();
    renderLayout();

    expect(screen.getByText(notice)).toBeInTheDocument();

    // Narrow screens hide the text and keep an info button with a tooltip.
    // Touch has no hover, so a tap toggles the tooltip.
    const info = screen.getByRole("button", { name: notice });
    await user.click(info);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(notice);
    // The tooltip repeats the name, so it is not announced again as a
    // description.
    expect(info).not.toHaveAttribute("aria-describedby");
  });

  it("has a skip link that moves focus to the content", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.tab();
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("mounts the tooltip and toast providers for pages", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(
      screen.getByRole("region", { name: "Notifications" }),
    ).toHaveTextContent("Link copied");
  });
});
