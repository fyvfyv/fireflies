import { tw } from "@tw";
import { Search, X } from "lucide-react";
import { type ComponentProps, type ReactNode, useRef } from "react";

type SearchFieldProps = Omit<ComponentProps<"input">, "type" | "value"> & {
  /** Accessible name of the input. */
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Rendered before the clear button, e.g. a "2 of 5" match counter. */
  trailing?: ReactNode;
  inputClassName?: string;
};

export function SearchField({
  label,
  value,
  onValueChange,
  onChange,
  onKeyDown,
  trailing,
  className,
  inputClassName,
  ref,
  ...props
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setRef = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };
  const clear = () => {
    onValueChange("");
    inputRef.current?.focus();
  };

  return (
    <div
      className={tw(
        "flex h-10 items-center gap-1 rounded-control border border-rule bg-sheet pr-1 pl-3 text-small transition-colors",
        // A flush 2px ink edge (border plus ring): the global offset outline
        // drew a second frame around the bordered field while typing.
        // outline-hidden only shows in forced-colors mode, which drops the ring.
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
        ref={setRef}
        type="search"
        aria-label={label}
        value={value}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          onChange?.(event);
          onValueChange(event.target.value);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "Escape" && value) {
            // Also stops Escape from closing a surrounding panel.
            event.preventDefault();
            event.stopPropagation();
            onValueChange("");
          }
        }}
        className={tw(
          "h-full min-w-0 flex-1 bg-transparent px-1.5 text-ink outline-none",
          "[&::-webkit-search-cancel-button]:appearance-none",
          inputClassName,
        )}
        {...props}
      />
      {trailing}
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={clear}
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
