import { tw } from "@tw";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";

type BackLinkProps = {
  to?: string;
  label?: string;
  className?: string;
};

export function BackLink({
  to = "/",
  label = "All meetings",
  className,
}: BackLinkProps) {
  return (
    <Link
      to={to}
      className={tw(
        "-mx-1.5 inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-small font-medium text-graphite transition-colors hover:text-ink",
        className,
      )}
    >
      <ArrowLeft aria-hidden="true" size={16} className={tw("shrink-0")} />
      {label}
    </Link>
  );
}
