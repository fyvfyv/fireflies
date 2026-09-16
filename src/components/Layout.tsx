import { tw } from "@tw";
import { Link, Outlet } from "react-router";

export function Layout() {
  return (
    <div className={tw("min-h-screen bg-white text-neutral-900")}>
      <header className={tw("border-b")}>
        <div
          className={tw(
            "mx-auto flex max-w-3xl flex-wrap items-baseline justify-between gap-2 px-4 py-3",
          )}
        >
          <Link to="/" className={tw("text-lg font-semibold")}>
            Recap
          </Link>
          <p className={tw("text-caption text-neutral-500")}>
            Shared public demo workspace: anyone can see recordings made here.
          </p>
        </div>
      </header>
      <main className={tw("mx-auto max-w-3xl px-4 py-6")}>
        <Outlet />
      </main>
    </div>
  );
}
