import { tw } from "@tw";
import { Link } from "react-router";

export function BackLink() {
  return (
    <Link
      to="/"
      className={tw("inline-block text-body text-neutral-600 hover:underline")}
    >
      ← All meetings
    </Link>
  );
}
