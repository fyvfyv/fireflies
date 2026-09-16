import { tw } from "@tw";
import { type ReactNode, useId } from "react";

type HeroProps = {
  /** The recorder sheet, the page's focal point. */
  recorder: ReactNode;
  /** Save progress and errors, shown under the recorder. */
  feedback?: ReactNode;
  /** Mic-free ways to start; omitted while a recording is in progress. */
  options?: ReactNode;
};

/**
 * Copy on the left with the options underneath, the recorder on the right
 * from 1024px. Source order (copy, recorder, options) is the phone order.
 */
export function Hero({ recorder, feedback, options }: HeroProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={tw(
        // 26rem leaves the copy column room for "Record the meeting." on
        // one line at the 1120px page width.
        "grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:gap-x-16",
      )}
    >
      <div className={tw("lg:col-start-1 lg:row-start-1 lg:pt-4")}>
        <h1 id={headingId} className={tw("max-w-[13em] type-display")}>
          <span className={tw("block")}>Record the meeting.</span> Get notes
          that point back to every moment.
        </h1>
        <p className={tw("mt-5 max-w-[34ch] type-lead text-graphite")}>
          Transcript, topic notes and action items in about a minute.
        </p>
      </div>
      <div
        className={tw(
          "flex flex-col gap-3 lg:col-start-2 lg:row-span-2 lg:row-start-1",
        )}
      >
        {recorder}
        {feedback}
      </div>
      {/* Keeps its row on wide screens so the copy doesn't jump when the
          options hide during a recording. */}
      <div
        className={tw(
          "empty:hidden lg:col-start-1 lg:row-start-2 lg:min-h-10 lg:self-end lg:empty:block",
        )}
      >
        {options}
      </div>
    </section>
  );
}
