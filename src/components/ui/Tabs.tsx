import * as TabsPrimitive from "@radix-ui/react-tabs";
import { tw } from "@tw";
import { type ComponentProps, useLayoutEffect, useRef, useState } from "react";

export const Tabs = TabsPrimitive.Root;

type IndicatorBox = { left: number; width: number };

export function TabsList({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof TabsPrimitive.List>, "ref">) {
  const listRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<IndicatorBox | null>(null);
  const [sliding, setSliding] = useState(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const active = list.querySelector<HTMLElement>(
        '[role="tab"][data-state="active"]',
      );
      setBox((prev) => {
        if (!active) return null;
        const next = { left: active.offsetLeft, width: active.offsetWidth };
        return prev?.left === next.left && prev.width === next.width
          ? prev
          : next;
      });
    };
    const resize = new ResizeObserver(measure);
    const observeTabs = () => {
      resize.disconnect();
      resize.observe(list);
      for (const tab of list.querySelectorAll('[role="tab"]')) {
        resize.observe(tab);
      }
    };
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => record.type === "childList")) {
        observeTabs();
      }
      measure();
    });

    measure();
    observeTabs();
    mutations.observe(list, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    if ("fonts" in document) document.fonts.ready.then(measure);
    const frame = requestAnimationFrame(() => setSliding(true));

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
    };
  }, []);

  return (
    <TabsPrimitive.List
      ref={listRef}
      className={tw(
        "relative flex items-center gap-6 border-b border-rule",
        className,
      )}
      {...props}
    >
      {children}
      <span
        aria-hidden="true"
        data-slot="tabs-indicator"
        className={tw(
          "pointer-events-none absolute -bottom-px left-0 h-0.5 rounded-full bg-ink",
          sliding && "transition-[transform,width] duration-220 ease-out-soft",
          !box && "invisible",
        )}
        style={{
          width: box?.width ?? 0,
          transform: `translateX(${box?.left ?? 0}px)`,
        }}
      />
    </TabsPrimitive.List>
  );
}

type TabsTriggerProps = ComponentProps<typeof TabsPrimitive.Trigger> & {
  count?: number;
};

export function TabsTrigger({
  className,
  children,
  count,
  ...props
}: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={tw(
        "inline-flex h-11 shrink-0 items-center gap-1.5 text-small font-medium whitespace-nowrap text-graphite transition-colors",
        "hover:text-ink disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-ink",
        className,
      )}
      {...props}
    >
      {children}
      {/* The space keeps the accessible name "Action items 3". */}
      {count !== undefined && (
        <>
          {" "}
          <span
            className={tw(
              "min-w-5 rounded-chip bg-sunken px-1.5 text-center text-caption text-graphite",
            )}
          >
            {count}
          </span>
        </>
      )}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={tw("rounded-sm focus-visible:outline-offset-4", className)}
      {...props}
    />
  );
}
