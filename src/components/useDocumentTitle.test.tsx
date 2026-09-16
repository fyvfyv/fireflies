import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { APP_TITLE, useDocumentTitle } from "./useDocumentTitle";

describe("useDocumentTitle", () => {
  afterEach(() => {
    document.title = "";
  });

  it("sets the title and follows changes", () => {
    const { rerender } = renderHook(({ title }) => useDocumentTitle(title), {
      initialProps: { title: "Weekly sync – Recap" },
    });
    expect(document.title).toBe("Weekly sync – Recap");

    rerender({ title: "Meeting not found – Recap" });
    expect(document.title).toBe("Meeting not found – Recap");
  });

  it("restores the app title on unmount", () => {
    const { unmount } = renderHook(() =>
      useDocumentTitle("Weekly sync – Recap"),
    );
    unmount();
    expect(document.title).toBe(APP_TITLE);
    expect(APP_TITLE).toBe("Recap");
  });
});
