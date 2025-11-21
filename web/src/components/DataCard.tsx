import { CloudUpload, Database, Layers, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { forwardRef } from "react";

export type DataCardProps = {
  title: string;
  description: string;
  actionLabel: string;
  fileAccept?: string;
  isLoaded: boolean;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSampleClick?: () => void;
  onView?: () => void;
  onImportText?: () => void;
  viewLabel?: string;
  adornment?: "deck" | "inventory";
  badge?: string;
};

const icons = {
  deck: Layers,
  inventory: Database
};

export const DataCard = forwardRef<HTMLInputElement, DataCardProps>(function DataCard(props, ref) {
  const Icon = props.adornment ? icons[props.adornment] : CloudUpload;

  return (
    <div className="flex flex-col rounded-3xl border border-white/5 bg-white/5 bg-gradient-to-br from-white/5 to-transparent p-5 shadow-2xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{props.title}</p>
          <h3 className="mt-1 text-xl font-semibold text-white">{props.description}</h3>
        </div>
        <span
          className={clsx(
            "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
            props.isLoaded ? "bg-emerald-400/15 text-emerald-200" : "bg-slate-800 text-slate-300"
          )}
        >
          {props.isLoaded ? "ready" : "pending"}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <label className="group inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10">
          <Icon className="h-4 w-4" />
          <span>{props.actionLabel}</span>
          <input ref={ref} type="file" accept={props.fileAccept} className="hidden" onChange={props.onFileChange} />
        </label>
        {props.onSampleClick ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-transparent bg-accent/20 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/30"
            onClick={props.onSampleClick}
          >
            <RefreshCw className="h-4 w-4" />
            Load sample
          </button>
        ) : null}
        {props.onImportText ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            onClick={props.onImportText}
          >
            <span>Paste text</span>
          </button>
        ) : null}
        {props.onView && props.isLoaded ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            onClick={props.onView}
          >
            <span>{props.viewLabel || "View"}</span>
          </button>
        ) : null}
      </div>
      {props.badge ? <p className="mt-3 text-xs text-slate-400">{props.badge}</p> : null}
    </div>
  );
});
