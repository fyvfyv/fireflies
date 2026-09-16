import { tw } from "@tw";

type ClockDigitsProps = { value: string; className?: string };

/**
 * A ticking clock ("0:34", "12:05") that doesn't jitter as digits change.
 * Mona Sans's tabular figures are a separate monospace design (slashed zero,
 * serifed one), so the clock keeps the proportional digits and fixes each one
 * in a 1ch cell instead: 1ch is the zero's advance, the widest digit at the
 * timer's axes. Screen readers get the value once, not cell by cell.
 */
export function ClockDigits({ value, className }: ClockDigitsProps) {
  return (
    <span className={tw("whitespace-nowrap", className)}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">
        {Array.from(value, (char, index) =>
          /\d/.test(char) ? (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: characters of a short fixed string; position is the identity
              key={index}
              data-slot="digit"
              className="inline-block w-[1ch] text-center"
            >
              {char}
            </span>
          ) : (
            char
          ),
        )}
      </span>
    </span>
  );
}
