import type { ActionItem } from "@shared/schemas";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionItemKey, groupByOwner, useDoneItems } from "./actionItemState";

const item = (task: string, owner: string | null): ActionItem => ({
  task,
  owner,
  due: null,
  startSecond: null,
});

describe("groupByOwner", () => {
  it("lists named owners alphabetically, then unassigned items", () => {
    const groups = groupByOwner([
      item("Send the invite", null),
      item("Write retry tests", "priya"),
      item("Tag the release", "Ana"),
      item("Update the changelog", "  "),
      item("Review the copy", "Priya"),
      item("Fix the build", "Daniel"),
    ]);

    expect(
      groups.map((group) => [
        group.owner,
        group.entries.map((entry) => [entry.index, entry.item.task]),
      ]),
    ).toEqual([
      ["Ana", [[2, "Tag the release"]]],
      ["Daniel", [[5, "Fix the build"]]],
      [
        "priya",
        [
          [1, "Write retry tests"],
          [4, "Review the copy"],
        ],
      ],
      [
        null,
        [
          [0, "Send the invite"],
          [3, "Update the changelog"],
        ],
      ],
    ]);
  });

  it("returns nothing for no items", () => {
    expect(groupByOwner([])).toEqual([]);
  });
});

describe("actionItemKey", () => {
  it("combines position and task, so edited notes don't inherit checks", () => {
    expect(actionItemKey(item("Tag the release", "Ana"), 2)).toBe(
      "2:Tag the release",
    );
  });
});

describe("useDoneItems", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("persists checked items per meeting", () => {
    const { result, unmount } = renderHook(() => useDoneItems("abc"));
    expect(result.current.isDone("0:Tag")).toBe(false);

    act(() => result.current.toggle("0:Tag"));

    expect(result.current.isDone("0:Tag")).toBe(true);
    expect(JSON.parse(localStorage.getItem("recap:done:abc") ?? "")).toEqual([
      "0:Tag",
    ]);
    unmount();

    const again = renderHook(() => useDoneItems("abc"));
    expect(again.result.current.isDone("0:Tag")).toBe(true);
    const other = renderHook(() => useDoneItems("xyz"));
    expect(other.result.current.isDone("0:Tag")).toBe(false);
  });

  it("unchecks an item and shares the state between views", () => {
    const first = renderHook(() => useDoneItems("abc"));
    const second = renderHook(() => useDoneItems("abc"));

    act(() => first.result.current.toggle("1:Send"));
    expect(second.result.current.isDone("1:Send")).toBe(true);

    act(() => second.result.current.toggle("1:Send"));
    expect(first.result.current.isDone("1:Send")).toBe(false);
    expect(localStorage.getItem("recap:done:abc")).toBe("[]");
  });

  it("follows changes made in another tab", () => {
    const { result } = renderHook(() => useDoneItems("abc"));

    act(() => {
      localStorage.setItem("recap:done:abc", JSON.stringify(["3:Ship"]));
      window.dispatchEvent(
        new StorageEvent("storage", { key: "recap:done:abc" }),
      );
    });

    expect(result.current.isDone("3:Ship")).toBe(true);
  });

  it("ignores corrupt data and unavailable storage", () => {
    localStorage.setItem("recap:done:abc", "{not json");
    const { result } = renderHook(() => useDoneItems("abc"));
    expect(result.current.isDone("0:Tag")).toBe(false);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota", "QuotaExceededError");
    });
    act(() => result.current.toggle("0:Tag"));

    // Still checked for this session, even though it couldn't be saved.
    expect(result.current.isDone("0:Tag")).toBe(true);
  });
});
