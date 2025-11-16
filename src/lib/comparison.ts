import { parseExportedDeck, type CardEntry, type DeckExport } from "./deckParser.js";
import type { PersistedDeck } from "./types.js";

export type Inventory = Record<string, number>;

export type MissingCard = {
  name: string;
  required: number;
  owned: number;
  missing: number;
  bucket: DeckBucket;
};

export type DeckBucket = keyof DeckExport;

type RequirementEntry = CardEntry & { bucket: DeckBucket };

export type ComparisonStatus = "buildable" | "close" | "unbuildable";

export type DeckComparison<TDeck extends PersistedDeck = PersistedDeck> = {
  deck: TDeck & { parsed: DeckExport };
  missingCards: MissingCard[];
  totalMissing: number;
  status: ComparisonStatus;
};

export function normalizeInventory(source: unknown): Inventory {
  if (Array.isArray(source)) {
    return source.reduce<Inventory>((acc, item) => {
      if (item && typeof item === "object" && "name" in item && "count" in item) {
        const name = String((item as { name: unknown }).name).trim();
        const count = Number((item as { count: unknown }).count);
        if (name && Number.isFinite(count)) {
          acc[name] = (acc[name] ?? 0) + Math.max(0, Math.floor(count));
        }
      }
      return acc;
    }, {});
  }

  if (source && typeof source === "object") {
    if ("cards" in source && Array.isArray((source as { cards: unknown }).cards)) {
      return normalizeInventory((source as { cards: unknown }).cards);
    }

    return Object.entries(source as Record<string, unknown>).reduce<Inventory>((acc, [name, value]) => {
      if (!name) {
        return acc;
      }
      const count = Number(value);
      if (Number.isFinite(count)) {
        acc[name] = Math.max(0, Math.floor(count));
      }
      return acc;
    }, {});
  }

  throw new Error("Unsupported inventory format. Use an object map or an array of { name, count } entries.");
}

export function compareDeck(
  deck: PersistedDeck,
  inventory: Inventory,
  maxMissing: number
): DeckComparison {
  const hydrated = ensureParsed(deck);
  const requirements = collectDeckRequirements(hydrated.parsed);
  const missingCards: MissingCard[] = [];
  let totalMissing = 0;

  for (const card of requirements) {
    const owned = inventory[card.name] ?? 0;
    if (owned < card.count) {
      const deficit = card.count - owned;
      totalMissing += deficit;
      missingCards.push({
        name: card.name,
        required: card.count,
        owned,
        missing: deficit,
        bucket: card.bucket
      });
    }
  }

  const status: ComparisonStatus =
    totalMissing === 0 ? "buildable" : totalMissing <= maxMissing ? "close" : "unbuildable";

  return { deck: hydrated, missingCards, totalMissing, status };
}

export function compareDecks(
  decks: PersistedDeck[],
  inventory: Inventory,
  maxMissing: number
): DeckComparison[] {
  return decks.map((deck) => compareDeck(deck, inventory, maxMissing));
}

export function collectDeckRequirements(deck: DeckExport): RequirementEntry[] {
  const order: DeckBucket[] = ["main", "battlefields", "runes", "sideboard"];
  return order.flatMap((bucket) => deck[bucket].map((card) => ({ ...card, bucket })));
}

function ensureParsed(deck: PersistedDeck): PersistedDeck & { parsed: DeckExport } {
  if (deck.parsed) {
    return deck as PersistedDeck & { parsed: DeckExport };
  }

  if (!deck.exportText) {
    throw new Error(`Deck ${deck.label ?? deck.slug} is missing both parsed data and exportText.`);
  }

  return {
    ...deck,
    parsed: parseExportedDeck(deck.exportText)
  };
}
