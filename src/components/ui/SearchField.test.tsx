import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchField } from "./SearchField";

function Controlled({
  initial = "",
  onChange,
  trailing,
}: {
  initial?: string;
  onChange?: (value: string) => void;
  trailing?: React.ReactNode;
}) {
  const [value, setValue] = useState(initial);
  return (
    <SearchField
      label="Search transcript"
      placeholder="Search transcript"
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      trailing={trailing}
    />
  );
}

describe("SearchField", () => {
  it("renders a labelled search box", () => {
    render(<Controlled />);

    const input = screen.getByRole("searchbox", { name: "Search transcript" });
    expect(input).toHaveAttribute("placeholder", "Search transcript");
    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();
  });

  it("reports typed text", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onChange={onChange} />);

    await user.type(screen.getByRole("searchbox"), "release");

    expect(onChange).toHaveBeenLastCalledWith("release");
    expect(screen.getByRole("searchbox")).toHaveValue("release");
  });

  it("clears the query from the clear button and refocuses the input", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Controlled initial="pricing" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(onChange).toHaveBeenLastCalledWith("");
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("searchbox")).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();
  });

  it("clears the query on Escape", async () => {
    const user = userEvent.setup();
    render(<Controlled initial="pricing" />);

    screen.getByRole("searchbox").focus();
    await user.keyboard("{Escape}");

    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("lets callers handle keys first", async () => {
    const onKeyDown = vi.fn((event: React.KeyboardEvent) => {
      if (event.key === "Escape") event.preventDefault();
    });
    const user = userEvent.setup();
    render(
      <SearchField
        label="Search"
        value="kept"
        onValueChange={() => {}}
        onKeyDown={onKeyDown}
      />,
    );

    screen.getByRole("searchbox").focus();
    await user.keyboard("{Enter}{Escape}");

    expect(onKeyDown).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("searchbox")).toHaveValue("kept");
  });

  it("draws a flush ink edge on focus instead of an offset outline", () => {
    const { container } = render(<Controlled />);

    // An offset outline around the bordered field read as a double frame
    // while typing.
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("has-[input:focus-visible]:ring-ink");
    expect(wrapper?.className).toContain(
      "has-[input:focus-visible]:border-ink",
    );
    expect(wrapper?.className).not.toContain("outline-offset-2");
    // Forced-colors mode drops the ring, so the wrapper keeps an outline
    // that only shows there.
    expect(wrapper?.className).toContain(
      "has-[input:focus-visible]:outline-hidden",
    );
  });

  it("renders a trailing slot", () => {
    render(<Controlled initial="a" trailing={<span>2 of 5</span>} />);

    expect(screen.getByText("2 of 5")).toBeInTheDocument();
  });
});
