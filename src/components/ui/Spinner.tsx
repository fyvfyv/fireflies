import { tw } from "@tw";
import { LoaderCircle } from "lucide-react";

export function Spinner({ size }: { size?: number }) {
  return (
    <LoaderCircle
      aria-hidden="true"
      data-slot="spinner"
      size={size}
      className={tw("shrink-0 animate-spin")}
    />
  );
}
