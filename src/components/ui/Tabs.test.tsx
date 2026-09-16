import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs";

function renderTabs(props: {
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  return render(
    <Tabs defaultValue={props.value ? undefined : "notes"} {...props}>
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
  it("renders a labelled tab list with the default panel", () => {
    renderTabs({});

    expect(
      screen.getByRole("tablist", { name: "Meeting sections" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Notes body");
  });

  it("shows a count badge inside the trigger", () => {
    renderTabs({});

    const tab = screen.getByRole("tab", { name: /Action items/ });
    expect(tab).toHaveTextContent("3");
    // Proportional digits: Mona Sans's tabular set has a slashed zero.
    expect(screen.getByText("3")).not.toHaveClass("tabular-nums");
  });

  it("switches panels with the arrow keys", async () => {
    const user = userEvent.setup();
    renderTabs({});

    await user.tab();
    expect(screen.getByRole("tab", { name: "Notes" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Action items/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Actions body");

    await user.keyboard("{End}");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Transcript body");

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Notes body");
  });

  it("reports clicks when controlled", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    renderTabs({ value: "actions", onValueChange });

    expect(screen.getByRole("tabpanel")).toHaveTextContent("Actions body");

    await user.click(screen.getByRole("tab", { name: "Transcript" }));

    expect(onValueChange).toHaveBeenCalledWith("transcript");
    // Still controlled by the parent, which did not change the value.
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Actions body");
  });

  it("slides the underline under the active tab", async () => {
    // jsdom has no layout; give each tab a fake box so the indicator can
    // measure it.
    const boxes: Record<string, { left: number; width: number }> = {
      Notes: { left: 0, width: 48 },
      Action: { left: 72, width: 110 },
      Transcript: { left: 206, width: 84 },
    };
    const boxOf = (el: HTMLElement) =>
      Object.entries(boxes).find(([label]) =>
        el.textContent?.startsWith(label),
      )?.[1];
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
    const { container } = renderTabs({});
    const indicator = container.querySelector<HTMLElement>(
      "[data-slot='tabs-indicator']",
    );

    expect(indicator).toHaveAttribute("aria-hidden", "true");
    await waitFor(() => expect(indicator?.style.width).toBe("48px"));
    expect(indicator?.style.transform).toBe("translateX(0px)");

    await user.click(screen.getByRole("tab", { name: "Transcript" }));

    await waitFor(() => expect(indicator?.style.width).toBe("84px"));
    expect(indicator?.style.transform).toBe("translateX(206px)");
  });
});
