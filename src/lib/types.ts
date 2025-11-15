import type { DeckExport } from "./deckParser.js";

export type ScrapedDeck = {
  slug: string;
  label: string;
  url: string;
  exportText: string;
};

export type PersistedDeck = ScrapedDeck & {
  parsed?: DeckExport;
};

export type InventoryCard = {
  name: string;
  count: number;
  condition?: string;
  finish?: string;
  setName?: string;
  collectorNumber?: string;
  priceUsd?: number | null;
  priceText?: string;
  imageUrl?: string | null;
  page?: number;
};
