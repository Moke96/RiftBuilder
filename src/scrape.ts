import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import { parseExportedDeck } from "./lib/deckParser.js";
import type { ScrapedDeck } from "./lib/types.js";

const BASE_URL = "https://piltoverarchive.com";
const DECK_LIBRARY_URL = `${BASE_URL}/decks`;

export type ScrapeOptions = {
  headless: boolean;
  mode: "sample" | "live";
  samplePath: string;
  limit: number;
  outputPath: string;
  requestDelayMs: number;
};

async function scrapeMostViewedDecks(options: ScrapeOptions): Promise<ScrapedDeck[]> {
  if (options.mode === "sample") {
    const exportText = await fs.readFile(options.samplePath, "utf8");
    return [
      {
        slug: "sample",
        label: "Sample Deck",
        url: options.samplePath,
        exportText
      }
    ];
  }

  const browser = await chromium.launch({ headless: options.headless });
  const context = await browser.newContext();
  const listingPage = await context.newPage();

  try {
    await listingPage.goto(DECK_LIBRARY_URL, { waitUntil: "domcontentloaded" });
    await acceptCookies(listingPage);

    const deckSummaries = await collectMostViewedSummaries(listingPage, options.limit);
    if (deckSummaries.length === 0) {
      console.warn("No decks detected under the Most Viewed tab.");
      return [];
    }

    const detailPage = await context.newPage();
    const scraped: ScrapedDeck[] = [];

    for (const summary of deckSummaries) {
      try {
        const exportText = await fetchDeckExport(detailPage, summary.url);
        scraped.push({ ...summary, exportText });
      } catch (error) {
        console.error(`Failed to fetch export text for ${summary.url}:`, error);
      }

      if (options.requestDelayMs > 0) {
        await detailPage.waitForTimeout(options.requestDelayMs);
      }
    }

    await detailPage.close();
    return scraped;
  } finally {
    await browser.close();
  }
}

async function collectMostViewedSummaries(page: Page, limit: number): Promise<Array<Omit<ScrapedDeck, "exportText">>> {
  const tab = page.getByRole("tab", { name: /Most Viewed/i });
  const panelId = await tab.getAttribute("aria-controls");
  if (!panelId) {
    throw new Error("Unable to locate Most Viewed tab content.");
  }

  await tab.click();

  const panel = page.locator(`#${panelId}`);
  await panel.waitFor({ state: "visible" });
  await panel.locator('a[href^="/decks/view/"]').first().waitFor();

  const entries = await panel
    .locator('a[href^="/decks/view/"]')
    .evaluateAll(
      (links, options: { max: number; baseUrl: string }) => {
        const results: Array<{ href: string; title: string }> = [];
        for (const link of links) {
          const heading = link.querySelector("h3");
          const href = link.getAttribute("href");
          if (!heading || !href) {
            continue;
          }

          results.push({
            href: new URL(href, options.baseUrl).toString(),
            title: heading.textContent?.trim() ?? "Unknown Deck"
          });

          if (results.length >= options.max) {
            break;
          }
        }

        return results;
      },
      { max: limit, baseUrl: BASE_URL }
    );

  return (entries as Array<{ href: string; title: string }>).map((entry) => ({
    slug: entry.href.split("/").pop() ?? entry.title.toLowerCase().replace(/\s+/g, "-"),
    label: entry.title,
    url: entry.href
  }));
}

async function fetchDeckExport(page: Page, deckUrl: string): Promise<string> {
  await page.goto(deckUrl, { waitUntil: "domcontentloaded" });
  await acceptCookies(page);

  const exportButton = page.getByRole("button", { name: /^Export$/i });
  await exportButton.click();

  const exportAsTextButton = page.getByRole("button", { name: /Export as Text/i });
  await exportAsTextButton.click();

  const dialog = page.getByRole("dialog", { name: /Export Deck as Text/i });
  await dialog.waitFor({ state: "visible" });
  const exportText = (await dialog.locator("pre").innerText()).trim();

  await closeDialog(dialog, page);
  return exportText;
}

async function acceptCookies(page: Page) {
  const acceptButton = page.getByRole("button", { name: /Accept All/i }).first();
  if (await acceptButton.isVisible().catch(() => false)) {
    await acceptButton.click({ timeout: 2000 }).catch(() => undefined);
  }
}

async function closeDialog(dialog: Locator, page: Page) {
  try {
    await dialog.getByRole("button", { name: /Close/i }).click({ timeout: 1000 });
  } catch {
    await page.keyboard.press("Escape").catch(() => undefined);
  }
}

async function main() {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  const decks = await scrapeMostViewedDecks(cliOptions);

  if (decks.length === 0) {
    console.warn("No decks scraped.");
    return;
  }

  const enriched = decks.map((deck) => ({
    ...deck,
    parsed: parseExportedDeck(deck.exportText)
  }));

  await fs.mkdir(path.dirname(cliOptions.outputPath), { recursive: true });
  await fs.writeFile(cliOptions.outputPath, JSON.stringify(enriched, null, 2), "utf8");

  console.log(`Saved ${enriched.length} deck(s) to ${cliOptions.outputPath}`);
  enriched.forEach((deck) => {
    console.log(`→ ${deck.label} (${deck.slug})`);
  });
}

function parseCliArgs(argv: string[]): ScrapeOptions {
  let mode: ScrapeOptions["mode"] = "sample";
  let isLiveMode = false;
  let headless = true;
  let samplePath = path.resolve(process.cwd(), "data/sample-export.txt");
  let limit = 20;
  let outputPath = path.resolve(process.cwd(), "data/most-viewed.json");
  let requestDelayMs = 300;

  argv.forEach((arg, index) => {
    if (arg === "--live") {
      mode = "live";
      isLiveMode = true;
    }

    if (arg === "--headed") {
      headless = false;
    }

    if (arg === "--sample" && argv[index + 1]) {
      samplePath = path.resolve(process.cwd(), argv[index + 1]);
    }

    if (arg === "--limit" && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (!Number.isNaN(parsed)) {
        limit = Math.max(1, Math.floor(parsed));
      }
    }

    if (arg === "--out" && argv[index + 1]) {
      outputPath = path.resolve(process.cwd(), argv[index + 1]);
    }

    if (arg === "--delay" && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (!Number.isNaN(parsed)) {
        requestDelayMs = Math.max(0, Math.floor(parsed));
      }
    }
  });

  if (isLiveMode && limit < 20) {
    console.warn(`Live mode requires at least 20 decks. Bumping limit from ${limit} to 20.`);
    limit = 20;
  }

  return { mode, headless, samplePath, limit, outputPath, requestDelayMs };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
