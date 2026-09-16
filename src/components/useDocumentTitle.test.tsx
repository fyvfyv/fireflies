import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useDocumentTitle } from "./useDocumentTitle";

it("sets the title while mounted and restores the app title after", () => {
  const { rerender, unmount } = renderHook(
    ({ title }) => useDocumentTitle(title),
    { initialProps: { title: "Weekly sync – Recap" } },
  );
  expect(document.title).toBe("Weekly sync – Recap");

  rerender({ title: "Meeting not found – Recap" });
  expect(document.title).toBe("Meeting not found – Recap");

  unmount();
  expect(document.title).toBe("Recap");
});
