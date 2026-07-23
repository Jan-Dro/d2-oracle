# Blueberries.gg God Roll Indexer

A dependency-free Node.js scraper that uses Blueberries.gg's All Weapons table as its canonical inventory, then joins each designated guide to extracted PvE/PvP barrels, magazines, perks, traits, and masterworks. Weapons without a guide or structured roll remain queryable with an explicit `rollStatus`.

## Run

Requires Node.js 20 or newer.

```bash
npm test
npm run scrape
npm run enrich
npm run audit
npm run query -- "word of crota"
npm run query -- "word of crota" --mode pve --json
```

The complete scrape currently takes about two minutes: the WordPress API has 9 pages, then the scraper cross-checks both the All Weapons database and live God Rolls Finder for legacy guides. The program honors the site's `Crawl-delay: 10`. Output is written atomically to `data/god-rolls.json`. Use `--pages 1` for a quick sample, `--fresh` to discard prior output, or `--output path.json` to change the destination.

`npm run enrich` preserves Blueberries rolls, fills missing random-roll weapons from the MIT-licensed DIM Voltron wishlist, supplements missing PvE recommendations from the GPL-3.0 Aegis-derived wishlist, and uses Bungie's public manifest to populate authoritative fixed rolls and official weapon imagery. Imported rolls include provider, license, source URL, and item/perk hashes.

`npm run audit` verifies that every inventory weapon has roll, fixed-roll, or configurable-option data; every roll has provenance; no unknown perk hashes remain; summary counts are current; and MIDA Multi-Tool retains its complete fixed roll and catalyst data.

## JSON shape

```json
{
  "schemaVersion": 3,
  "generatedAt": "...",
  "count": 1,
  "weapons": [{
    "id": "word-of-crota-god-rolls",
    "weapon": "Word of Crota",
    "image": "https://www.bungie.net/common/destiny2_content/screenshots/....jpg",
    "images": {
      "primary": "https://www.bungie.net/common/destiny2_content/screenshots/....jpg",
      "screenshot": "https://www.bungie.net/common/destiny2_content/screenshots/....jpg",
      "icon": "https://www.bungie.net/common/destiny2_content/icons/....jpg",
      "blueberries": "https://www.blueberries.gg/wp-content/uploads/..."
    },
    "imageSource": "bungie-manifest",
    "imageItemHash": "...",
    "rollStatus": "available",
    "rolls": [{
      "mode": "pve",
      "fields": { "Barrel": ["Hammer-Forged Rifling"], "Perk 1": ["Repulsor Brace", "Dragonfly"] }
    }],
    "source": { "url": "https://www.blueberries.gg/...", "modifiedAt": "..." }
  }]
}
```

`image` remains the backward-compatible primary image. Use `images.screenshot` for full-width cards and detail pages, and `images.icon` for small square inventory UI. `images.blueberries` preserves the original scraped artwork when one existed.

## Responsible use

- The scraper enforces the site's published 10-second crawl delay and retries temporary errors with backoff.
- Keep source attribution in any public UI. This database represents Blueberries.gg's editorial recommendations, not facts supplied by Bungie.
- Review Blueberries.gg's terms and obtain permission before commercial redistribution. Their content and editorial selections remain theirs.
- Re-run periodically; Destiny balance and recommendations change.
