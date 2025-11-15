import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import type { InventoryCard } from "./lib/types.js";

const CARDNEXUS_BASE_URL = "https://app.cardnexus.com/en/users";

export type InventoryScrapeOptions = {
  username: string;
  headless: boolean;
  outputPath: string;
  delayMs: number;
  maxPages: number; // 0 == unlimited
};

type InventoryScrapeResult = {
  cards: InventoryCard[];
  pagesVisited: number;
  url: string;
};

async function scrapeInventory(options: InventoryScrapeOptions): Promise<InventoryScrapeResult> {
  const browser = await chromium.launch({ headless: options.headless });
  const page = await browser.newPage();
  const inventoryUrl = `${CARDNEXUS_BASE_URL}/${options.username}/inventory`;

  try {
    await page.goto(inventoryUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main");

    const cards: InventoryCard[] = [];
    let pageIndex = 1;

    while (true) {
      const entries = await collectCardsFromPage(page, pageIndex);
      cards.push(...entries);
      console.log(`Page ${pageIndex}: captured ${entries.length} entries (${cards.length} total).`);

      const nextButton = page.getByRole("button", { name: /^Next$/i });
      const hasNextButton = (await nextButton.count()) > 0;
      const reachedLimit = options.maxPages > 0 && pageIndex >= options.maxPages;
      const nextDisabled = !hasNextButton || (await nextButton.isDisabled().catch(() => true));

      if (nextDisabled || reachedLimit) {
        break;
      }

      const summaryBefore = await readSummaryText(page);
      await nextButton.click();
      await waitForSummaryChange(page, summaryBefore).catch(() => page.waitForTimeout(500));

      if (options.delayMs > 0) {
        await page.waitForTimeout(options.delayMs);
      }

      pageIndex += 1;
    }

    return { cards, pagesVisited: pageIndex, url: inventoryUrl };
  } finally {
    await browser.close();
  }
}

async function collectCardsFromPage(page: Page, pageIndex: number): Promise<InventoryCard[]> {
  const gridLocator = page
    .locator("main div.grid")
    .filter({ has: page.locator('img[alt^="Product image for"]') })
    .first();

  await gridLocator.waitFor({ state: "visible" });

  const extractionScript = function extractCards(grid: Element, currentPage: number) {
      const entries = Array.from(grid.children as unknown as Element[])
        .map((child) => {
          const image = child.querySelector<HTMLImageElement>('img[alt^="Product image for"]');
          const infoBlock = child.querySelector<HTMLDivElement>("div.flex.flex-col.space-y-2");
          if (!image || !infoBlock) {
            return null;
          }

          const overlay = child.querySelector<HTMLDivElement>("div.absolute.bottom-5");
          const overlayText = (overlay?.textContent ?? "").replace(/\s+/g, " ").trim();
          const quantityMatch = overlayText.match(/x\s*(\d+)/i);
          const count = quantityMatch ? Number.parseInt(quantityMatch[1], 10) : 1;
          const overlayParts = overlayText
            .split("-")
            .map((part) => part.replace(/x\s*\d+/i, "").trim())
            .filter(Boolean);
          const condition = overlayParts[0] ?? "";

          const setName = (infoBlock.querySelector<HTMLSpanElement>("div.flex.items-center.text-secondary-text span")?.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim();
          const collectorNumberRaw = (infoBlock.querySelector<HTMLSpanElement>("span.text-secondary-text.text-xs")?.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim();
          const collectorNumber = collectorNumberRaw.replace(/^#/, "");

          const name = (infoBlock.querySelector<HTMLSpanElement>("span.text-primary-text.text-sm.line-clamp-1")?.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim();

          const finishChips = Array.from(
            infoBlock.querySelectorAll<HTMLSpanElement>("div.flex.items-center.gap-2 span.inline-flex")
          )
            .map((chip) => (chip.textContent ?? "").replace(/\s+/g, " ").trim())
            .filter(Boolean);
          const finish = finishChips.join(", ");

          const priceText = (
            infoBlock.querySelector<HTMLSpanElement>("div.flex.items-center.justify-between span.text-primary-text.text-sm")
              ?.textContent ?? ""
          )
            .replace(/\s+/g, " ")
            .trim();
          const numericPrice = Number.parseFloat(priceText.replace(/[^0-9.]/g, ""));
          const priceUsd = Number.isFinite(numericPrice) ? numericPrice : null;

          return {
            name,
            count: count || 1,
            condition,
            finish,
            setName,
            collectorNumber,
            priceText: priceText || undefined,
            priceUsd,
            imageUrl: image.getAttribute("src"),
            page: currentPage
          } satisfies InventoryCard;
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry?.name));

      return entries as InventoryCard[];
    };

  const cards = await gridLocator.evaluate(extractionScript, pageIndex);

  return cards;
}

async function readSummaryText(page: Page): Promise<string> {
  return (
    (await page.evaluate(() => {
      const summaryNode = Array.from(document.querySelectorAll("p, div, span")).find((node) =>
        /Showing \d+ to \d+ of \d+ results/.test(node.textContent ?? "")
      );
      return summaryNode?.textContent?.trim() ?? "";
    })) ?? ""
  );
}

async function waitForSummaryChange(page: Page, previous: string): Promise<void> {
  if (!previous) {
    await page.waitForTimeout(500);
    return;
  }

  await page.waitForFunction(
    (prev) => {
      const summaryNode = Array.from(document.querySelectorAll("p, div, span")).find((node) =>
        /Showing \d+ to \d+ of \d+ results/.test(node.textContent ?? "")
      );
      const text = summaryNode?.textContent?.trim() ?? "";
      return text && text !== prev;
    },
    previous
  );
}

function aggregateCounts(cards: InventoryCard[]): Record<string, number> {
  return cards.reduce<Record<string, number>>((acc, card) => {
    const key = card.name.trim();
    if (!key) {
      return acc;
    }
    acc[key] = (acc[key] ?? 0) + Math.max(0, card.count);
    return acc;
  }, {});
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const scrapeResult = await scrapeInventory(options);

  if (scrapeResult.cards.length === 0) {
    console.warn("Inventory page returned no products.");
  }

  const counts = aggregateCounts(scrapeResult.cards);
  const totalCopies = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const payload = {
    user: options.username,
    source: scrapeResult.url,
    scrapedAt: new Date().toISOString(),
    pagesVisited: scrapeResult.pagesVisited,
    totalEntries: scrapeResult.cards.length,
    totalCopies,
    cards: scrapeResult.cards,
    counts
  };

  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.writeFile(options.outputPath, JSON.stringify(payload, null, 2), "utf8");

  console.log(
    `Saved ${scrapeResult.cards.length} entries (${totalCopies} copies) to ${options.outputPath}. ` +
      `Pages visited: ${scrapeResult.pagesVisited}.`
  );
}

function parseCliArgs(argv: string[]): InventoryScrapeOptions {
  let username = process.env.CARDNEXUS_USER ?? "";
  let headless = true;
  let outputPath = path.resolve(process.cwd(), "data/inventory.json");
  let delayMs = 250;
  let maxPages = 0;

  argv.forEach((arg, index) => {
    if (arg === "--user" && argv[index + 1]) {
      username = argv[index + 1].trim();
    }

    if (arg === "--headed") {
      headless = false;
    }

    if (arg === "--out" && argv[index + 1]) {
      outputPath = path.resolve(process.cwd(), argv[index + 1]);
    }

    if (arg === "--delay" && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (!Number.isNaN(parsed)) {
        delayMs = Math.max(0, Math.floor(parsed));
      }
    }

    if (arg === "--pages" && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      if (!Number.isNaN(parsed)) {
        maxPages = Math.max(0, Math.floor(parsed));
      }
    }
  });

  if (!username) {
    throw new Error("Missing CardNexus username. Pass --user <handle> or set CARDNEXUS_USER.");
  }

  return { username, headless, outputPath, delayMs, maxPages };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
