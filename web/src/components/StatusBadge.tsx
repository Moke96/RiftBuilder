import type { ComparisonStatus } from "@shared/lib/comparison";
import clsx from "clsx";

const palette: Record<ComparisonStatus, string> = {
  buildable: "border-emerald-400/60 bg-emerald-400/10 text-emerald-200",
  close: "border-amber-400/60 bg-amber-400/10 text-amber-100",
  unbuildable: "border-rose-400/60 bg-rose-400/10 text-rose-200"
};

export function StatusBadge({ status }: { status: ComparisonStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
        palette[status]
      )}
    >
      {status}
    </span>
  );
}
