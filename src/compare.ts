import fs from "node:fs/promises";
import path from "node:path";
import { parseExportedDeck, type DeckExport } from "./lib/deckParser.js";
import {
  compareDecks,
  normalizeInventory,
  type ComparisonStatus,
  type DeckComparison,
  type Inventory
} from "./lib/comparison.js";
import type { PersistedDeck } from "./lib/types.js";

type CompareOptions = {
  decksPath: string;
  inventoryPath: string;
  maxMissing: number;
  jsonOutputPath?: string;
};

async function main() {
  const options = parseCompareArgs(process.argv.slice(2));

  const [inventory, decks] = await Promise.all([
    loadInventory(options.inventoryPath),
    loadDecks(options.decksPath)
  ]);

  if (decks.length === 0) {
    console.warn(`No decks found in ${options.decksPath}. Run the scraper first (npm run scrape).`);
    return;
  }

  const results = compareDecks(decks, inventory, options.maxMissing);

  if (options.jsonOutputPath) {
    await fs.mkdir(path.dirname(options.jsonOutputPath), { recursive: true });
    await fs.writeFile(options.jsonOutputPath, JSON.stringify(results, null, 2), "utf8");
    console.log(`Comparison breakdown saved to ${options.jsonOutputPath}`);
  }

  printReport(results, options, inventory);
}

async function loadDecks(filePath: string): Promise<Array<PersistedDeck & { parsed: DeckExport }>> {
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error(`Deck file ${filePath} must contain an array.`);
  }

  return data.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("Encountered malformed deck entry.");
    }

    const parsed = entry.parsed ?? parseExportedDeck(entry.exportText);
    return { ...(entry as PersistedDeck), parsed };
  });
}

async function loadInventory(filePath: string): Promise<Inventory> {
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw);
  const inventory = normalizeInventory(data);

  if (Object.keys(inventory).length === 0) {
    throw new Error(`Inventory file ${filePath} does not contain any card counts.`);
  }

  return inventory;
}

function printReport(results: DeckComparison[], options: CompareOptions, inventory: Inventory) {
  const summary = {
    buildable: 0,
    close: 0,
    unbuildable: 0
  } satisfies Record<ComparisonStatus, number>;

  console.log("=== Deck Comparison Report ===");
  console.log(`Deck source: ${options.decksPath} (${results.length} deck(s))`);
  console.log(`Inventory: ${options.inventoryPath} (${Object.keys(inventory).length} tracked card(s))`);
  console.log(`Near-miss threshold: <= ${options.maxMissing} missing copy/copies total.`);
  console.log("");

  results.forEach((result) => {
    summary[result.status] += 1;
    const statusLabel = result.status.toUpperCase();
    const missingLabel = result.totalMissing === 0 ? "complete" : `${result.totalMissing} missing`;
    console.log(`- ${result.deck.label} [${statusLabel}] — ${missingLabel}`);

    if (result.missingCards.length > 0) {
      const preview = result.missingCards.slice(0, 8);
      preview.forEach((card) => {
        console.log(`    • ${card.name}: need ${card.missing} more (have ${card.owned}/${card.required})`);
      });
      if (result.missingCards.length > preview.length) {
        console.log(`    • …and ${result.missingCards.length - preview.length} more card(s)`);
      }
    } else {
      console.log("    • All requirements satisfied.");
    }

    console.log("");
  });

  console.log("Summary:");
  console.log(`  Buildable: ${summary.buildable}`);
  console.log(`  Close (<=${options.maxMissing} missing): ${summary.close}`);
  console.log(`  Unbuildable: ${summary.unbuildable}`);
}

function parseCompareArgs(argv: string[]): CompareOptions {
  let decksPath = path.resolve(process.cwd(), "data/most-viewed.json");
  let inventoryPath = path.resolve(process.cwd(), "data/sample-inventory.json");
  let maxMissing = 4;
  let jsonOutputPath: string | undefined;

  argv.forEach((arg, index) => {
    if (arg === "--decks" && argv[index + 1]) {
      decksPath = path.resolve(process.cwd(), argv[index + 1]);
    }

    if (arg === "--inventory" && argv[index + 1]) {
      inventoryPath = path.resolve(process.cwd(), argv[index + 1]);
    }

    if (arg === "--max-missing" && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (!Number.isNaN(parsed)) {
        maxMissing = Math.max(0, Math.floor(parsed));
      }
    }

    if (arg === "--json" && argv[index + 1]) {
      jsonOutputPath = path.resolve(process.cwd(), argv[index + 1]);
    }
  });

  return { decksPath, inventoryPath, maxMissing, jsonOutputPath };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
