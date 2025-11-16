import rawCards from "./cards.json";

export type CardArtMeta = {
  name: string;
  publicCode?: string;
  imageUrl?: string | null;
  setName?: string;
  rarity?: string;
  domains?: string[];
};

export type CardArtLookup = (name: string) => CardArtMeta | null;

type RawCard = {
  name?: string;
  publicCode?: string;
  setName?: string;
  rarity?: { label?: string } | null;
  domains?: Array<{ label?: string | null }> | null;
  cardImage?: { url?: string | null } | null;
};

const STOP_WORDS = new Set(["starter", "showcase", "default", "classic", "alt art", "promo"]);

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/(?:the|a|an)/g, " ")
    .replace(/(?:starter|showcase|default|classic|alt art|promo)/g, " ")
    .replace(/(?:set|skin)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function deriveKeys(rawName: string | undefined | null): string[] {
  const keys: string[] = [];
  const addKey = (value: string | undefined | null) => {
    if (!value) {
      return;
    }
    const normalized = normalizeKey(value);
    if (normalized && !keys.includes(normalized)) {
      keys.push(normalized);
    }
  };

  if (!rawName) {
    return keys;
  }

  addKey(rawName);

  rawName
    .split(/[,–-]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .forEach(addKey);

  const collapsed = rawName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  if (collapsed) {
    keys.push(collapsed);
  }

  const withoutStopWords = normalizeKey(
    rawName
      .split(/[-–]/)
      .map((segment) => segment.trim())
      .filter((segment) => !STOP_WORDS.has(segment.toLowerCase()))
      .join(" ")
  );
  if (withoutStopWords && !keys.includes(withoutStopWords)) {
    keys.push(withoutStopWords);
  }

  return keys.filter(Boolean);
}

const cardIndex = (rawCards as RawCard[]).reduce<Record<string, CardArtMeta>>((acc, entry) => {
  const meta: CardArtMeta = {
    name: entry.name ?? "",
    publicCode: entry.publicCode ?? undefined,
    imageUrl: entry.cardImage?.url ?? null,
    setName: entry.setName ?? undefined,
    rarity: entry.rarity?.label ?? undefined,
    domains: entry.domains?.map((domain) => domain.label).filter(Boolean) as string[]
  };

  deriveKeys(entry.name).forEach((key) => {
    if (!key) {
      return;
    }
    if (!acc[key]) {
      acc[key] = meta;
    }
  });

  return acc;
}, {});

export const getCardArtMeta: CardArtLookup = (name) => {
  if (!name) {
    return null;
  }

  const queryKeys = deriveKeys(name);
  for (const key of queryKeys) {
    const match = cardIndex[key];
    if (match) {
      return match;
    }
  }

  return null;
};
