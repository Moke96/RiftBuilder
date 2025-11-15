import clsx from "clsx";

export type SummaryCardProps = {
  label: string;
  value: number | string;
  tone?: "default" | "success" | "warn" | "danger";
  helper?: string;
};

const toneStyles: Record<NonNullable<SummaryCardProps["tone"]>, string> = {
  default: "bg-slate-900/70 border-slate-800",
  success: "bg-emerald-950/30 border-emerald-700/30",
  warn: "bg-amber-950/40 border-amber-700/40",
  danger: "bg-rose-950/40 border-rose-700/40"
};

export function SummaryCard({ label, value, tone = "default", helper }: SummaryCardProps) {
  return (
    <div className={clsx("rounded-2xl border px-5 py-4 shadow-inner", toneStyles[tone])}>
      <p className="text-sm uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-400">{helper}</p> : null}
    </div>
  );
}
