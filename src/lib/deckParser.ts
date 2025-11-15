export type CardEntry = {
  count: number;
  name: string;
};

export type DeckExport = {
  main: CardEntry[];
  battlefields: CardEntry[];
  runes: CardEntry[];
  sideboard: CardEntry[];
};

const BATTLEFIELD_NAMES = new Set([
  "Grove of the God-Willow",
  "Hallowed Tomb",
  "Monastery of Hirana",
  "Navori Fighting Pit",
  "Obelisk of Power",
  "Reaver's Row",
  "Reckoner's Arena",
  "Sigil of the Storm",
  "Startipped Peak",
  "Targon's Peak",
  "The Arena's Greatest",
  "The Candlelit Sanctum",
  "The Dreaming Tree",
  "The Grand Plaza",
  "Trifarian War Camp",
  "Vilemaw's Lair",
  "Void Gate",
  "Windswept Hillock",
  "Zaun Warrens"
]);

/**
 * Parses the "Export as Text" payload from a Piltover Archive deck page.
 * The exporter uses blank lines liberally, so we classify cards by name-based heuristics
 * instead of relying on section headers.
 */
export function parseExportedDeck(exportText: string): DeckExport {
  const deck: DeckExport = {
    main: [],
    battlefields: [],
    runes: [],
    sideboard: []
  };

  let section: keyof DeckExport = "main";

  for (const rawLine of exportText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (/^Sideboard:?$/i.test(line)) {
      section = "sideboard";
      continue;
    }

    const entry = parseCardLine(line);

    if (/Rune/i.test(entry.name)) {
      deck.runes.push(entry);
      continue;
    }

    if (BATTLEFIELD_NAMES.has(entry.name)) {
      deck.battlefields.push(entry);
      continue;
    }

    deck[section].push(entry);
  }

  return deck;
}

function parseCardLine(line: string): CardEntry {
  const match = line.match(/^(\d+)\s+(.+)$/);
  if (!match) {
    throw new Error(`Unable to parse export line: ${line}`);
  }

  return {
    count: Number(match[1]),
    name: match[2].trim()
  };
}
