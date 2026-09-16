import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs";

function renderTabs() {
  return render(
    <Tabs defaultValue="notes">
      <TabsList aria-label="Meeting sections">
        <TabsTrigger value="notes">Notes</TabsTrigger>
        <TabsTrigger value="actions" count={3}>
          Action items
        </TabsTrigger>
        <TabsTrigger value="transcript">Transcript</TabsTrigger>
      </TabsList>
      <TabsContent value="notes">Notes body</TabsContent>
      <TabsContent value="actions">Actions body</TabsContent>
      <TabsContent value="transcript">Transcript body</TabsContent>
    </Tabs>,
  );
}

describe("Tabs", () => {
  it("switches panels with the keyboard and names a tab with its count", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.tab();
    expect(screen.getByRole("tab", { name: "Notes" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Action items 3" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Actions body");

    await user.keyboard("{End}");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Transcript body");
  });

  it("slides the underline under the active tab", async () => {
    const boxes: Record<string, { left: number; width: number }> = {
      Notes: { left: 0, width: 48 },
      Transcript: { left: 206, width: 84 },
    };
    const boxOf = (el: HTMLElement) => boxes[el.textContent ?? ""];
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(
      function (this: HTMLElement) {
        return boxOf(this)?.left ?? 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return boxOf(this)?.width ?? 0;
      },
    );
    const user = userEvent.setup();
    const { container } = renderTabs();
    const indicator = container.querySelector<HTMLElement>(
      "[data-slot='tabs-indicator']",
    );

    await waitFor(() => expect(indicator?.style.width).toBe("48px"));
    expect(indicator?.style.transform).toBe("translateX(0px)");

    await user.click(screen.getByRole("tab", { name: "Transcript" }));

    await waitFor(() => expect(indicator?.style.width).toBe("84px"));
    expect(indicator?.style.transform).toBe("translateX(206px)");
  });
});
