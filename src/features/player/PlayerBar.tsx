import type { ActionItem, NoteSection } from "@shared/schemas";
import { tw } from "@tw";
import { Pause, Play, RotateCcw, RotateCw, VolumeX } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ClockDigits } from "@/components/ui/ClockDigits";
import { IconButton } from "@/components/ui/IconButton";
import { Kbd } from "@/components/ui/Kbd";
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/Menu";
import { Spinner } from "@/components/ui/Spinner";
import { useToastOffset } from "@/components/ui/Toaster";
import { formatShortTime } from "@/lib/time";
import { usePlayer } from "./PlayerProvider";
import { releasePointerFocus } from "./releasePointerFocus";
import { TopicTape } from "./TopicTape";

const RATES = [0.75, 1, 1.25, 1.5, 2] as const;
// Used until the bar has been measured (and in jsdom, which has no layout).
const FALLBACK_HEIGHT = 64;

const formatRate = (rate: number) => `${rate}×`;

type PlayerBarProps = {
  sections: readonly Pick<NoteSection, "heading" | "startSecond">[];
  actionItems: readonly Pick<ActionItem, "startSecond">[];
  /** Reports the bar's height, e.g. to size panels that stop above it. */
  onHeightChange?: (height: number) => void;
  className?: string;
};

export function PlayerBar({
  sections,
  actionItems,
  onHeightChange,
  className,
}: PlayerBarProps) {
  const player = usePlayer();
  const { status, playing, available, duration, rate } = player;
  const [scrub, setScrub] = useState<number | null>(null);
  const height = useHeight(onHeightChange);
  useToastOffset(height.value);

  const loading = status === "loading";
  const label = playing || loading ? "Pause" : "Play";
  const shown = scrub ?? player.currentTime;

  return (
    <section
      ref={height.ref}
      aria-label="Audio player"
      // The transcript reads this to know where the visible page ends.
      data-player-bar=""
      className={tw(
        "sticky bottom-0 z-30 border-t border-rule bg-sheet shadow-float",
        className,
      )}
    >
      <div
        className={tw(
          "flex flex-wrap items-center gap-x-1 px-3 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]",
          "sm:px-4 md:flex-nowrap md:gap-x-2 md:px-8 md:py-3",
        )}
      >
        <IconButton
          label={label}
          variant="primary"
          disabled={!available}
          onClick={player.toggle}
          tooltip={<ShortcutTip label={label} keys="Space" />}
          className={tw("mr-1 rounded-full active:scale-95")}
        >
          {loading ? (
            <Spinner size={20} />
          ) : playing ? (
            <Pause size={20} fill="currentColor" strokeWidth={0} />
          ) : (
            // Optically centered: the triangle's mass sits left of its box.
            <Play
              size={20}
              fill="currentColor"
              strokeWidth={0}
              className={tw("translate-x-px")}
            />
          )}
        </IconButton>
        <IconButton
          label="Back 10 seconds"
          disabled={!available}
          onClick={(event) => {
            player.skip(-10);
            releasePointerFocus(event);
          }}
          tooltip={<ShortcutTip label="Back 10 seconds" keys="J" />}
        >
          <SkipIcon direction="back" />
        </IconButton>
        <IconButton
          label="Forward 10 seconds"
          disabled={!available}
          onClick={(event) => {
            player.skip(10);
            releasePointerFocus(event);
          }}
          tooltip={<ShortcutTip label="Forward 10 seconds" keys="L" />}
        >
          <SkipIcon direction="forward" />
        </IconButton>

        {available ? (
          <p className={tw("ml-1 type-small whitespace-nowrap md:ml-2")}>
            <span
              // The current time never has more characters than the
              // duration, so a slot that wide keeps the tape from shifting.
              style={{ minWidth: `${formatShortTime(duration).length}ch` }}
              className={tw("inline-block text-right text-ink")}
            >
              <ClockDigits value={formatShortTime(shown)} />
            </span>
            <span aria-hidden="true" className={tw("text-faint")}>
              {" / "}
            </span>
            <span className={tw("sr-only")}> of </span>
            <span className={tw("text-graphite")}>
              {formatShortTime(duration)}
            </span>
          </p>
        ) : (
          <p
            // The status below announces it; this copy is for the eyes.
            aria-hidden="true"
            className={tw(
              "ml-1 flex items-center gap-1.5 type-small whitespace-nowrap text-graphite md:ml-2",
            )}
          >
            <VolumeX aria-hidden="true" size={16} />
            Audio unavailable
          </p>
        )}
        {/* Always mounted, so screen readers hear the change when it fails. */}
        <p role="status" className={tw("sr-only")}>
          {available ? "" : "Audio unavailable"}
        </p>

        <TopicTape
          sections={sections}
          actionItems={actionItems}
          onScrub={setScrub}
          className={tw(
            "order-first mb-0.5 basis-full md:order-none md:mx-3 md:mb-0 md:basis-auto md:flex-1",
          )}
        />

        <RateMenu rate={rate} onChange={player.setRate} disabled={!available} />
      </div>
    </section>
  );
}

function useHeight(onChange?: (height: number) => void) {
  const ref = useRef<HTMLElement>(null);
  const [value, setValue] = useState(FALLBACK_HEIGHT);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const next = element.offsetHeight || FALLBACK_HEIGHT;
      setValue(next);
      onChangeRef.current?.(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, value };
}

// The amount is in the label and tooltip; a numeral small enough to fit
// inside the icon would be unreadable.
function SkipIcon({ direction }: { direction: "back" | "forward" }) {
  const Icon = direction === "back" ? RotateCcw : RotateCw;
  return <Icon aria-hidden="true" size={20} strokeWidth={1.75} />;
}

function ShortcutTip({ label, keys }: { label: string; keys: string }) {
  return (
    <span className={tw("flex items-center gap-2")}>
      {label}
      <Kbd
        className={tw(
          "h-4 min-w-4 border-sheet/25 bg-transparent px-1 text-sheet/80",
        )}
      >
        {keys}
      </Kbd>
    </span>
  );
}

function RateMenu({
  rate,
  onChange,
  disabled,
}: {
  rate: number;
  onChange: (rate: number) => void;
  disabled: boolean;
}) {
  return (
    <Menu>
      <MenuTrigger asChild disabled={disabled}>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Playback speed: ${formatRate(rate)}`}
          className={tw("ml-auto min-w-12 px-2 md:ml-0")}
        >
          {formatRate(rate)}
        </Button>
      </MenuTrigger>
      <MenuContent side="top" className={tw("min-w-32")}>
        <MenuRadioGroup
          aria-label="Playback speed"
          value={String(rate)}
          onValueChange={(value) => onChange(Number(value))}
        >
          {RATES.map((option) => (
            <MenuRadioItem key={option} value={String(option)}>
              {formatRate(option)}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
