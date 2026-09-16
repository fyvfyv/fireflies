import { tw } from "@tw";

type ClockDigitsProps = { value: string; className?: string };

// Mona Sans's tabular figures use a slashed zero, so each digit gets a 1ch cell.
export function ClockDigits({ value, className }: ClockDigitsProps) {
  return (
    <span className={tw("whitespace-nowrap", className)}>
      <span className={tw("sr-only")}>{value}</span>
      <span aria-hidden="true">
        {Array.from(value, (char, index) =>
          /\d/.test(char) ? (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: characters of a short fixed string; position is the identity
              key={index}
              data-slot="digit"
              className={tw("inline-block w-[1ch] text-center")}
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
