# RiftBuilder

Piltover Archive companion toolchain that will scrape the "Most Viewed" decks, parse their exported card lists, and compare them with your personal collection.

## Prerequisites

- Node.js 20+
- `npm install`
- Install Playwright browsers (once):

```powershell
npx playwright install
```

## Scripts

- `npm run dev` / `npm run scrape` – Scrape Piltover Archive. By default it parses the bundled sample export, but passing `--live` will pull the "Most Viewed" tab and save the parsed payloads to `data/most-viewed.json`.
- `npm run compare` – Loads the sample export and prepares for deck vs. inventory comparison. Pass `--deck` or `--inventory` to use custom files.
- `npm run inventory` – Scrape the public CardNexus inventory for a given username and emit a JSON payload with detailed cards plus a `counts` map that `npm run compare` can ingest.
- `npm run build` – Type-checks and emits JavaScript to `dist/`.

### Scraper options

```text
--live        Enable real scraping (otherwise the local sample is used)
--headed      Open a visible browser window for debugging
--limit <n>   Number of decks to capture from the Most Viewed tab (default: 20; minimum 20 in live mode)
--out <path>  Where to write the JSON payload (default: data/most-viewed.json)
--delay <ms>  Wait time between deck fetches to stay polite (default: 300ms)
--sample <path>  Override the sample export file when not running live
```

Each live run writes an array of `{ slug, label, url, exportText, parsed }` objects, so downstream tooling can operate without re-scraping.

### Inventory scraper options

```text
--user <handle>   CardNexus username to inspect (or set CARDNEXUS_USER)
--headed          Open the browser window for debugging
--out <path>      Output path (default: data/inventory.json)
--delay <ms>      Optional pause between pagination clicks (default: 250ms)
--pages <n>       Stop after visiting <n> pages (default: all pages)
```

The produced JSON looks like:

```jsonc
{
	"user": "moke",
	"cards": [
		{ "name": "Acceptable Losses", "count": 1, "finish": "Standard", "condition": "NM", ... }
	],
	"counts": {
		"Acceptable Losses": 1
	}
}
```

`compare.ts` automatically consumes the `counts` map (or the `cards` array) via `normalizeInventory`, so you can immediately point `--inventory` at the generated file.

## Sample Data

`data/sample-export.txt` contains the exact "Export as Text" payload you provided, so you can iterate on the parser without hitting the site repeatedly. Replace this file or pass a different path when testing.

`data/sample-inventory.json` holds a tiny mock collection to trial the comparison flow.

## Comparing Decks vs. Inventory

```bash
npm run compare -- --decks data/most-viewed.json --inventory data/sample-inventory.json
```

Options:

- `--decks <path>`: JSON produced by the scraper (default: `data/most-viewed.json`).
- `--inventory <path>`: JSON file describing your owned cards (default: `data/sample-inventory.json`).
- `--max-missing <number>`: Total missing copies allowed to still count as "close" (default: `4`).
- `--json <path>`: Optional path to write the raw comparison results.

Inventory formats supported:

- Simple object map: `{ "Card Name": 4, "Another Card": 2 }`.
- Array of objects: `[{ "name": "Card Name", "count": 4 }]`.
- Object with `cards` array: `{ "cards": [ ... ] }`.

## Visual Deck Dashboard

Prefer a UI instead of terminal output? A Vite + React dashboard lives under `web/`.

```bash
# start the UI locally (http://localhost:5173)
npm run web:dev

# production build + preview server
npm run web:build
npm run web:preview
```

Features:

- Upload scraped deck JSON (`data/most-viewed.json`) and your inventory to see status chips.
- Toggle filters (Buildable / Close / Unbuildable), search by deck name, and tune the "near miss" threshold live.
- Inspect missing cards per deck with total deficits highlighted.
- Quickly bootstrap with the bundled samples at `web/public/sample-decks.json` and `web/public/sample-inventory.json`.
