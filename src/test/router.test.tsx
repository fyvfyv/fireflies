import { renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { useToast } from "@/components/ui/Toaster";
import { Tooltip } from "@/components/ui/Tooltip";
import { renderWithRouter, routerWrapper } from "./router";

function Page() {
  const { toast } = useToast();
  return (
    <Tooltip content="Copies the page link">
      <button type="button" onClick={() => toast({ title: "Link copied" })}>
        Copy
      </button>
    </Tooltip>
  );
}

describe("renderWithRouter", () => {
  it("provides the app-level toaster and tooltips like the layout does", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Page />);

    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Copies the page link",
    );

    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("region", { name: "Notifications" }),
    ).toHaveTextContent("Link copied");
  });
});

describe("routerWrapper", () => {
  it("wraps hooks in a router at the given route", () => {
    const { result } = renderHook(() => useLocation(), {
      wrapper: routerWrapper("/m/abc"),
    });

    expect(result.current.pathname).toBe("/m/abc");
  });
});
