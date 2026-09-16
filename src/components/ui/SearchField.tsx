import { tw } from "@tw";
import { Search, X } from "lucide-react";
import { type ComponentProps, type ReactNode, useRef } from "react";

type SearchFieldProps = Omit<
  ComponentProps<"input">,
  "type" | "value" | "onChange" | "ref"
> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  trailing?: ReactNode;
};

export function SearchField({
  label,
  value,
  onValueChange,
  onKeyDown,
  trailing,
  className,
  ...props
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={tw(
        "flex h-10 items-center gap-1 rounded-control border border-rule bg-sheet pr-1 pl-3 text-small transition-colors",
        // outline-hidden, unlike outline-none, still shows in forced colors.
        "hover:border-faint has-[input:focus-visible]:border-ink has-[input:focus-visible]:ring-1 has-[input:focus-visible]:ring-ink has-[input:focus-visible]:outline-hidden",
        className,
      )}
    >
      <Search
        aria-hidden="true"
        size={16}
        strokeWidth={1.75}
        className={tw("shrink-0 text-faint")}
      />
      <input
        ref={inputRef}
        type="search"
        aria-label={label}
        value={value}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "Escape" && value) {
            event.preventDefault();
            event.stopPropagation();
            onValueChange("");
          }
        }}
        className={tw(
          "h-full min-w-0 flex-1 bg-transparent px-1.5 text-ink outline-none",
          "[&::-webkit-search-cancel-button]:appearance-none",
        )}
        {...props}
      />
      {trailing}
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onValueChange("");
            inputRef.current?.focus();
          }}
          className={tw(
            "grid size-7 shrink-0 place-items-center rounded-md text-graphite transition-colors hover:bg-sunken hover:text-ink",
          )}
        >
          <X aria-hidden="true" size={16} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
