import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { tw } from "@tw";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";

export const Menu = MenuPrimitive.Root;
export const MenuTrigger = MenuPrimitive.Trigger;
export const MenuRadioGroup = MenuPrimitive.RadioGroup;

export function MenuContent({
  className,
  align = "end",
  sideOffset = 6,
  collisionPadding = 8,
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={tw(
          "z-50 min-w-48 overflow-y-auto rounded-control border border-rule bg-sheet p-1 text-small text-ink shadow-float",
          "max-h-(--radix-dropdown-menu-content-available-height)",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

// `outline-solid` restores the style that `outline-none` zeroes.
const itemClasses =
  "relative flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 outline-none select-none data-highlighted:bg-sunken data-disabled:pointer-events-none data-disabled:opacity-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink focus-visible:outline-solid";

type MenuItemProps = ComponentProps<typeof MenuPrimitive.Item> & {
  tone?: "default" | "danger";
};

export function MenuItem({
  tone = "default",
  className,
  ...props
}: MenuItemProps) {
  return (
    <MenuPrimitive.Item
      className={tw(itemClasses, tone === "danger" && "text-danger", className)}
      {...props}
    />
  );
}

export function MenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem
      className={tw(itemClasses, "pr-8", className)}
      {...props}
    >
      {children}
      <MenuPrimitive.ItemIndicator
        className={tw("absolute right-2.5 flex items-center")}
      >
        <Check aria-hidden="true" size={16} strokeWidth={1.75} />
      </MenuPrimitive.ItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

export function MenuSeparator({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      className={tw("-mx-1 my-1 h-px bg-rule", className)}
      {...props}
    />
  );
}
