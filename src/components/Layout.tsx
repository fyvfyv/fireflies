import { tw } from "@tw";
import { Info } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { Link, Outlet, ScrollRestoration } from "react-router";
import { AppProviders } from "@/components/AppProviders";
import { Logo } from "@/components/icons/Logo";
import { Tooltip } from "@/components/ui/Tooltip";

const CONTENT_ID = "content";
const NOTICE =
  "Shared demo workspace. Anyone with the link can see recordings.";

// Pages decide their own width and gutters (the meeting page is full width),
// so <main> only fills the space under the top bar.
export function Layout() {
  return (
    <AppProviders>
      <div className={tw("flex min-h-dvh flex-col")}>
        <SkipLink />
        {/* Without it a page opens at the previous page's scroll offset. The
            meeting page's hash tabs opt out with preventScrollReset. */}
        <ScrollRestoration />
        <header className={tw("border-b border-rule bg-sheet")}>
          <div
            className={tw(
              "flex h-14 items-center justify-between gap-4 px-4 md:px-8",
            )}
          >
            <Link to="/" className={tw("-mx-1.5 rounded-md px-1.5 py-1")}>
              <Logo />
            </Link>
            <WorkspaceNotice />
          </div>
        </header>
        <main
          id={CONTENT_ID}
          tabIndex={-1}
          className={tw("min-w-0 flex-1 focus:outline-none")}
        >
          <Outlet />
        </main>
      </div>
    </AppProviders>
  );
}

function SkipLink() {
  // Focus is moved by hand: following the hash would put #content into the
  // URL, where the meeting page keeps its tab state.
  const skip = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const main = document.getElementById(CONTENT_ID);
    main?.focus();
    main?.scrollIntoView();
  };
  return (
    <a
      href={`#${CONTENT_ID}`}
      onClick={skip}
      className={tw(
        "absolute top-2 left-2 z-50 -translate-y-[200%] rounded-control bg-ink px-3 py-2 text-small font-medium text-sheet transition-transform focus:translate-y-0",
      )}
    >
      Skip to content
    </a>
  );
}

function WorkspaceNotice() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p
        className={tw(
          "hidden min-w-0 items-center gap-1.5 text-small text-graphite sm:flex",
        )}
      >
        <Info aria-hidden="true" className={tw("shrink-0")} />
        <span className={tw("truncate")}>{NOTICE}</span>
      </p>
      {/* Narrow screens: icon only. Touch has no hover, so a tap opens the
          tooltip; tapping elsewhere closes it. */}
      <Tooltip
        content={NOTICE}
        open={open}
        onOpenChange={setOpen}
        side="bottom"
        align="end"
      >
        <button
          type="button"
          aria-label={NOTICE}
          // The tooltip repeats the name; the explicit key overrides the
          // description radix would add, so it isn't read twice.
          aria-describedby={undefined}
          onClick={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
          className={tw(
            "grid size-9 place-items-center rounded-control text-graphite transition-colors hover:bg-sunken hover:text-ink sm:hidden",
          )}
        >
          <Info aria-hidden="true" size={18} />
        </button>
      </Tooltip>
    </>
  );
}
