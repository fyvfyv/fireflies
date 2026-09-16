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
  it("lists owners alphabetically regardless of case, then unassigned items", () => {
    const groups = groupByOwner([
      item("Send the invite", null),
      item("Write retry tests", "priya"),
      item("Tag the release", "Ana"),
      item("Update the changelog", "  "),
      item("Review the copy", "Priya"),
    ]);

    expect(
      groups.map((group) => [
        group.owner,
        group.entries.map((entry) => entry.index),
      ]),
    ).toEqual([
      ["Ana", [2]],
      ["priya", [1, 4]],
      [null, [0, 3]],
    ]);
  });
});

describe("actionItemKey", () => {
  it("includes the task, so regenerated notes don't inherit checks", () => {
    expect(actionItemKey(item("Tag the release", "Ana"), 2)).toBe(
      "2:Tag the release",
    );
  });
});

describe("useDoneItems", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("persists checks per meeting and shares them between views", () => {
    const first = renderHook(() => useDoneItems("abc"));
    const second = renderHook(() => useDoneItems("abc"));
    const other = renderHook(() => useDoneItems("xyz"));

    act(() => first.result.current.toggle("0:Tag"));
    expect(second.result.current.isDone("0:Tag")).toBe(true);
    expect(other.result.current.isDone("0:Tag")).toBe(false);
    expect(localStorage.getItem("recap:done:abc")).toBe('["0:Tag"]');

    act(() => second.result.current.toggle("0:Tag"));
    expect(first.result.current.isDone("0:Tag")).toBe(false);
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

  it("ignores corrupt data and keeps checks when storage is unavailable", () => {
    localStorage.setItem("recap:done:abc", "{not json");
    const { result } = renderHook(() => useDoneItems("abc"));
    expect(result.current.isDone("0:Tag")).toBe(false);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota", "QuotaExceededError");
    });
    act(() => result.current.toggle("0:Tag"));

    expect(result.current.isDone("0:Tag")).toBe(true);
  });
});
