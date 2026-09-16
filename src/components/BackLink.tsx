import { tw } from "@tw";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";

export function BackLink({ label }: { label: string }) {
  return (
    <Link
      to="/"
      className={tw(
        "-mx-1.5 inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-small font-medium text-graphite transition-colors hover:text-ink",
      )}
    >
      <ArrowLeft aria-hidden="true" size={16} className={tw("shrink-0")} />
      {label}
    </Link>
  );
}
