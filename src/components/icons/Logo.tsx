import { tw } from "@tw";

/** The marker swipe: a highlighter stroke over a line of text. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className={tw("size-6 shrink-0", className)}
    >
      <path
        d="M4.5 15.5 7.2 5.5h13.3l-2.7 10z"
        fill="var(--marker)"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M3 19.5h12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={tw("inline-flex items-center gap-2 text-ink", className)}>
      <LogoMark />
      <span className={tw("text-heading font-stretch-[112%]")}>Recap</span>
    </span>
  );
}
