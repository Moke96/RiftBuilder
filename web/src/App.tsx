import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowUpDown, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import type { PersistedDeck } from "@shared/lib/types";
import {
  compareDecks,
  normalizeInventory,
  type ComparisonStatus,
  type DeckComparison,
  type Inventory
} from "@shared/lib/comparison";
import { StatusBadge } from "@app/components/StatusBadge";
import { SummaryCard } from "@app/components/SummaryCard";
import { DataCard } from "@app/components/DataCard";
import { getCardArtMeta, type CardArtLookup } from "@app/lib/cardArt";

type StatusFilter = "all" | ComparisonStatus;
type SortOrder = "default" | "missing-asc" | "missing-desc";
type MissingBucket = DeckComparison["missingCards"][number]["bucket"];

const statusFilters: Array<{ label: string; value: StatusFilter }> = [
  { label: "All", value: "all" },
  { label: "Buildable", value: "buildable" },
  { label: "Close", value: "close" },
  { label: "Unbuildable", value: "unbuildable" }
];

const missingBucketOrder: MissingBucket[] = ["main", "battlefields", "runes", "sideboard"];
const missingBucketLabels: Record<MissingBucket, string> = {
  main: "Main deck",
  battlefields: "Battlefields",
  runes: "Runes",
  sideboard: "Sideboard"
};

function formatMissingCardsForExport(entry: DeckComparison): string {
  const sections = missingBucketOrder
    .map((bucket) => {
      const cards = entry.missingCards.filter((card) => card.bucket === bucket);
      if (cards.length === 0) {
        return null;
      }
      return cards.map((card) => `${card.missing} ${card.name}`).join("\n");
    })
    .filter((section): section is string => Boolean(section));

  return sections.join("\n\n");
}

const sortOptions: Array<{ label: string; value: SortOrder }> = [
  { label: "Original order", value: "default" },
  { label: "Missing asc", value: "missing-asc" },
  { label: "Missing desc", value: "missing-desc" }
];

type ToastState = { tone: "success" | "error" | "info"; message: string } | null;

export default function App() {
  const [decks, setDecks] = useState<PersistedDeck[]>([]);
  const [decksLabel, setDecksLabel] = useState("No deck file loaded yet");
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [inventoryLabel, setInventoryLabel] = useState("No inventory file loaded yet");
  const [maxMissing, setMaxMissing] = useState(4);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("default");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<DeckComparison | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const getCardMeta = useCallback<CardArtLookup>((name) => getCardArtMeta(name), []);

  const comparisonState = useMemo<{
    data: DeckComparison[];
    error: string | null;
  }>(() => {
    if (!inventory || decks.length === 0) {
      return { data: [], error: null };
    }
    try {
      return { data: compareDecks(decks, inventory, maxMissing), error: null };
    } catch (error) {
      return { data: [], error: error instanceof Error ? error.message : String(error) };
    }
  }, [decks, inventory, maxMissing]);

  useEffect(() => {
    if (comparisonState.error) {
      setToast({ tone: "error", message: comparisonState.error });
    }
  }, [comparisonState.error]);

  const comparisons = comparisonState.data;

  const filtered = useMemo(() => {
    const base = comparisons.filter((entry) => {
      const matchesFilter = statusFilter === "all" ? true : entry.status === statusFilter;
      const matchesSearch = entry.deck.label.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });

    if (sortOrder === "missing-asc") {
      return [...base].sort((a, b) => a.totalMissing - b.totalMissing || a.deck.label.localeCompare(b.deck.label));
    }
    if (sortOrder === "missing-desc") {
      return [...base].sort((a, b) => b.totalMissing - a.totalMissing || a.deck.label.localeCompare(b.deck.label));
    }
    return base;
  }, [comparisons, search, statusFilter, sortOrder]);

  const summaryCounts = useMemo(() => {
    return comparisons.reduce(
      (acc, entry) => {
        acc[entry.status] += 1;
        return acc;
      },
      { buildable: 0, close: 0, unbuildable: 0 }
    );
  }, [comparisons]);

  async function hydrateDecksFromBlob(blob: Blob, label: string) {
    const text = await blob.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error("Deck data must be an array");
    }
    setDecks(parsed as PersistedDeck[]);
    setDecksLabel(label);
    setSelection(null);
  }

  async function hydrateInventoryFromBlob(blob: Blob, label: string) {
    const text = await blob.text();
    const parsed = JSON.parse(text);
    const normalized = normalizeInventory(parsed);
    setInventory(normalized);
    setInventoryLabel(label);
  }

  async function loadSampleDecks() {
    const response = await fetch("/sample-decks.json");
    if (!response.ok) {
      throw new Error("Unable to load sample decks");
    }
    await hydrateDecksFromBlob(await response.blob(), "Sample decks");
    setToast({ tone: "success", message: "Sample deck list ready" });
  }

  async function loadSampleInventory() {
    const response = await fetch("/sample-inventory.json");
    if (!response.ok) {
      throw new Error("Unable to load sample inventory");
    }
    await hydrateInventoryFromBlob(await response.blob(), "Sample inventory");
    setToast({ tone: "success", message: "Sample inventory loaded" });
  }

  async function loadEverythingSample() {
    try {
      await Promise.all([loadSampleDecks(), loadSampleInventory()]);
      setToast({ tone: "success", message: "Sample data hydrated" });
    } catch (error) {
      setToast({ tone: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  function handleDeckUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    hydrateDecksFromBlob(file, file.name)
      .then(() => setToast({ tone: "success", message: `Loaded ${file.name}` }))
      .catch((error) => setToast({ tone: "error", message: error instanceof Error ? error.message : String(error) }));
    event.target.value = "";
  }

  function handleInventoryUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    hydrateInventoryFromBlob(file, file.name)
      .then(() => setToast({ tone: "success", message: `Inventory set from ${file.name}` }))
      .catch((error) => setToast({ tone: "error", message: error instanceof Error ? error.message : String(error) }));
    event.target.value = "";
  }

  const ready = decks.length > 0 && Boolean(inventory);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-16 pt-10">
        <header className="rounded-3xl border border-white/5 bg-gradient-to-br from-indigo-900/40 via-slate-900 to-slate-950 p-8 shadow-2xl">
          <p className="text-sm uppercase tracking-[0.3em] text-indigo-200/80">RiftBuilder</p>
          <h1 className="mt-3 text-4xl font-semibold text-white">Deck viability dashboard</h1>
          <p className="mt-3 max-w-3xl text-lg text-slate-300">
            Upload the Piltover Archive deck dump alongside your collection log to instantly spot which archetypes are ready to queue and which are just a few crafts away.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-full bg-accent/30 px-5 py-2 text-sm font-semibold text-accent transition hover:bg-accent/40"
              onClick={loadEverythingSample}
            >
              Load sample data
            </button>
            <a
              href="https://github.com/moke96/RiftBuilder"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white/80 transition hover:border-white/40"
            >
              Scraper docs
            </a>
          </div>
        </header>

        {toast ? (
          <div
            className={clsx(
              "flex items-center justify-between rounded-2xl border px-4 py-3 text-sm",
              toast.tone === "error" && "border-rose-500/40 bg-rose-500/10 text-rose-100",
              toast.tone === "success" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
              toast.tone === "info" && "border-slate-600/40 bg-slate-800/60 text-slate-100"
            )}
          >
            <span>{toast.message}</span>
            <button className="text-xs uppercase tracking-wide text-white/70" onClick={() => setToast(null)}>
              dismiss
            </button>
          </div>
        ) : null}

        <section className="grid gap-6 md:grid-cols-2">
          <DataCard
            title="Deck snapshots"
            description="Drop the scraped JSON payload"
            actionLabel="Upload deck JSON"
            fileAccept="application/json"
            isLoaded={decks.length > 0}
            onFileChange={handleDeckUpload}
            onSampleClick={loadSampleDecks}
            adornment="deck"
            badge={decksLabel}
          />
          <DataCard
            title="Collection ledger"
            description="Import your owned card counts"
            actionLabel="Upload inventory"
            fileAccept="application/json"
            isLoaded={Boolean(inventory)}
            onFileChange={handleInventoryUpload}
            onSampleClick={loadSampleInventory}
            adornment="inventory"
            badge={inventoryLabel}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <SummaryCard label="Decks" value={decks.length} helper="loaded from JSON" />
          <SummaryCard label="Tracked cards" value={inventory ? Object.keys(inventory).length : 0} helper="unique entries" />
          <SummaryCard label="Buildable" value={summaryCounts.buildable} tone="success" />
          <SummaryCard label="Near misses" value={summaryCounts.close} tone="warn" helper={`<= ${maxMissing} missing copies`} />
        </section>

        <section className="rounded-3xl border border-white/5 bg-slate-950/60 p-6 shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {statusFilters.map((filter) => (
                <button
                  key={filter.value}
                  className={clsx(
                    "rounded-full border px-4 py-2 text-sm font-semibold uppercase tracking-wide",
                    statusFilter === filter.value
                      ? "border-accent/60 bg-accent/10 text-accent"
                      : "border-white/10 text-white/70 hover:border-white/30"
                  )}
                  onClick={() => setStatusFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm text-white/70">
                <SlidersHorizontal className="h-4 w-4" />
                <span>Max missing: {maxMissing}</span>
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={maxMissing}
                  onChange={(e) => setMaxMissing(Number(e.target.value))}
                  className="ml-2"
                />
              </label>
              <label className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm text-white/70">
                <ArrowUpDown className="h-4 w-4" />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  className="bg-transparent text-white focus:outline-none"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value} className="bg-slate-900 text-white">
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm">
                <Search className="h-4 w-4 text-white/50" />
                <input
                  type="text"
                  placeholder="Search deck"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent text-white outline-none placeholder:text-white/40"
                />
              </label>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.8fr)] lg:items-start">
            <DeckSelectionPanel
              ready={ready}
              filtered={filtered}
              selection={selection}
              setSelection={setSelection}
            />
            <div className="min-h-[55rem] rounded-2xl border border-white/10 bg-slate-900/50 p-5">
              {selection ? (
                <DeckDetails entry={selection} getCardMeta={getCardMeta} />
              ) : (
                <p className="text-center text-slate-400">Pick a deck to inspect the full breakdown.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function DeckSelectionPanel({
  ready,
  filtered,
  selection,
  setSelection
}: {
  ready: boolean;
  filtered: DeckComparison[];
  selection: DeckComparison | null;
  setSelection: (entry: DeckComparison | null) => void;
}) {
  const containerClass = "flex min-h-[20rem] flex-col gap-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-4 lg:h-[55rem]";

  if (!ready) {
    return (
      <div className={clsx(containerClass, "items-center justify-center text-center text-slate-400") }>
        Load decks and inventory to see the analysis.
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className={clsx(containerClass, "items-center justify-center text-center text-slate-400") }>
        No decks match the current filter.
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-400">
        <span>Deck pool</span>
        <span>{filtered.length} entries</span>
      </div>
      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1">
        {filtered.map((entry) => (
          <button
            key={entry.deck.slug}
            className={clsx(
              "group flex w-full items-center justify-between gap-4 rounded-2xl border bg-slate-950/40 px-4 py-4 text-left transition",
              selection?.deck.slug === entry.deck.slug
                ? "border-accent/70 bg-accent/10 shadow-lg shadow-accent/10"
                : "border-white/10 hover:border-accent/40 hover:bg-slate-950/70"
            )}
            onClick={() => setSelection(entry)}
          >
            <div className="space-y-2">
              <p className="text-lg font-semibold text-white">{entry.deck.label}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/15 px-2 py-0.5 text-[0.7rem] tracking-wide text-slate-300">
                  {entry.totalMissing === 0 ? "Ready to craft" : `${entry.totalMissing} missing copies`}
                </span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.7rem] tracking-wide text-slate-400">
                  {entry.missingCards.length} cards short
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge status={entry.status} />
              <ChevronRight className="h-5 w-5 text-white/40 transition group-hover:translate-x-1" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

type MissingCardEntry = DeckComparison["missingCards"][number];

function DeckDetails({ entry, getCardMeta }: { entry: DeckComparison; getCardMeta: CardArtLookup }) {
  const totalMain = entry.deck.parsed.main.reduce((sum, card) => sum + card.count, 0);
  const [focusedCard, setFocusedCard] = useState<{ name: string; bucket: MissingBucket } | null>(
    entry.missingCards[0] ? { name: entry.missingCards[0].name, bucket: entry.missingCards[0].bucket } : null
  );
  const [isExportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    setFocusedCard(entry.missingCards[0] ? { name: entry.missingCards[0].name, bucket: entry.missingCards[0].bucket } : null);
  }, [entry]);

  const focusedMeta = focusedCard ? getCardMeta(focusedCard.name) : null;
  const groupedMissing = useMemo(() => {
    return entry.missingCards.reduce((acc, card) => {
      (acc[card.bucket] ??= []).push(card);
      return acc;
    }, {} as Partial<Record<MissingBucket, MissingCardEntry[]>>);
  }, [entry]);
  const missingExportText = useMemo(() => formatMissingCardsForExport(entry), [entry]);
  return (
    <>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Focused deck</p>
          <h3 className="text-2xl font-semibold text-white">{entry.deck.label}</h3>
          <a className="text-sm text-slate-400" href={entry.deck.url} target="_blank" rel="noopener noreferrer">{entry.deck.url}</a>
        </div>
        <StatusBadge status={entry.status} />
      </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MiniStat label="Main" value={`${totalMain} cards`} />
        <MiniStat label="Runes" value={entry.deck.parsed.runes.length} />
        <MiniStat label="Battlefields" value={entry.deck.parsed.battlefields.length} />
        <MiniStat label="Sideboard" value={entry.deck.parsed.sideboard.length} />
        </div>

        <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Missing pieces</p>
          {entry.missingCards.length ? (
            <button
              type="button"
              className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/80 transition hover:border-white/40"
              onClick={() => setExportOpen(true)}
            >
              Export list
            </button>
          ) : null}
        </div>
        {entry.missingCards.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            All requirements satisfied.
          </p>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="max-h-[30rem] overflow-y-auto pr-3">
              <div className="flex flex-col gap-4">
                {missingBucketOrder.map((bucket) => {
                  const cards = groupedMissing[bucket];
                  if (!cards?.length) {
                    return null;
                  }
                  return (
                    <div key={bucket}>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">{missingBucketLabels[bucket]}</p>
                      <ul className="mt-2 flex flex-col gap-2">
                        {cards.map((card) => {
                          const meta = getCardMeta(card.name);
                          const artUrl = meta?.imageUrl ?? null;
                          const descriptor = [meta?.setName, meta?.rarity].filter(Boolean).join(" · ");
                          const domainLabel = meta?.domains?.join(" • ");
                          const isFocused = focusedCard?.name === card.name && focusedCard?.bucket === card.bucket;
                          return (
                            <li
                              key={`${card.name}-${card.bucket}`}
                              className={clsx(
                                "flex gap-3 rounded-2xl border px-3 py-2 text-sm text-white/80 transition",
                                isFocused ? "border-accent/60 bg-accent/5" : "border-white/10 bg-white/5 hover:border-accent/40"
                              )}
                              onMouseEnter={() => setFocusedCard({ name: card.name, bucket: card.bucket })}
                              onFocus={() => setFocusedCard({ name: card.name, bucket: card.bucket })}
                              tabIndex={0}
                            >
                              <div className="h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-900/40">
                                {artUrl ? (
                                  <img src={artUrl} alt={card.name} className="h-full w-full object-cover" loading="lazy" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-[10px] text-white/40">No art</div>
                                )}
                              </div>
                              <div className="flex flex-1 flex-col">
                                <div className="flex items-center justify-between">
                                  <span>{card.name}</span>
                                  <span className="text-xs text-slate-400">
                                    {card.owned}/{card.required}
                                  </span>
                                </div>
                                {descriptor ? <p className="text-xs text-slate-400">{descriptor}</p> : null}
                                {domainLabel ? <p className="text-[11px] text-slate-500">{domainLabel}</p> : null}
                                <p className="text-xs text-amber-200">Missing {card.missing}</p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-4">
              {focusedCard && focusedMeta ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-full rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                    <img
                      src={focusedMeta.imageUrl ?? undefined}
                      alt={focusedCard.name}
                      className="mx-auto h-[22rem] max-h-[22rem] rounded-2xl object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-white">{focusedCard.name}</p>
                    <p className="text-sm text-slate-400">
                      {[focusedMeta.setName, focusedMeta.rarity].filter(Boolean).join(" · ") || "Set info unavailable"}
                    </p>
                    {focusedMeta.domains?.length ? (
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{focusedMeta.domains.join(" • ")}</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-center text-sm text-slate-400">
                  Hover a card to preview full art
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
      {isExportOpen && entry.missingCards.length ? (
        <MissingExportModal
          text={missingExportText}
          onClose={() => setExportOpen(false)}
          deckLabel={entry.deck.label}
        />
      ) : null}
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function MissingExportModal({ text, onClose, deckLabel }: { text: string; onClose: () => void; deckLabel: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Export</p>
            <h4 className="text-xl font-semibold text-white">{deckLabel}</h4>
          </div>
          <button
            type="button"
            className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/80 transition hover:border-white/40"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-400">Copy this block into Cardmarket’s import box.</p>
        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <pre className="max-h-[18rem] overflow-y-auto whitespace-pre-wrap text-sm text-slate-100">{text}</pre>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className={clsx(
              "rounded-full px-5 py-2 text-sm font-semibold text-slate-900",
              copied ? "bg-emerald-400" : "bg-accent"
            )}
            onClick={handleCopy}
          >
            {copied ? "Copied" : "Copy to clipboard"}
          </button>
        </div>
      </div>
    </div>
  );
}
