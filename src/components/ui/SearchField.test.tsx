import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type KeyboardEvent, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchField } from "./SearchField";

function Controlled({
  initial = "",
  onKeyDown,
}: {
  initial?: string;
  onKeyDown?: (event: KeyboardEvent) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <SearchField
      label="Search transcript"
      value={value}
      onValueChange={setValue}
      onKeyDown={onKeyDown}
    />
  );
}

const searchbox = () =>
  screen.getByRole("searchbox", { name: "Search transcript" });

describe("SearchField", () => {
  it("clears the query from the clear button and refocuses the input", async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.type(searchbox(), "release");
    expect(searchbox()).toHaveValue("release");
    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(searchbox()).toHaveValue("");
    expect(searchbox()).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();
  });

  it("clears the query on Escape", async () => {
    const user = userEvent.setup();
    render(<Controlled initial="pricing" />);

    searchbox().focus();
    await user.keyboard("{Escape}");

    expect(searchbox()).toHaveValue("");
  });

  it("lets callers handle keys first", async () => {
    const onKeyDown = vi.fn((event: KeyboardEvent) => event.preventDefault());
    const user = userEvent.setup();
    render(<Controlled initial="kept" onKeyDown={onKeyDown} />);

    searchbox().focus();
    await user.keyboard("{Escape}");

    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(searchbox()).toHaveValue("kept");
  });
});
