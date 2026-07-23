#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseArticleMetadata, parseFinderLinks, parseGodRolls, parseWeaponDatabase, text, weaponName } from "./parser.mjs";

const { values } = parseArgs({ options: {
  output: { type: "string", short: "o", default: "data/god-rolls.json" },
  delay: { type: "string", default: "10000" },
  pages: { type: "string" },
  resume: { type: "boolean", default: true },
  fresh: { type: "boolean", default: false },
}});
const output = resolve(values.output);
const delayMs = Math.max(10_000, Number(values.delay) || 10_000);
const pageLimit = values.pages ? Math.max(1, Number(values.pages)) : Infinity;
const endpoint = "https://www.blueberries.gg/wp-json/wp/v2/posts";
const finderUrl = "https://www.blueberries.gg/weapons/destiny-2-weapon-rolls/";
const allWeaponsUrl = "https://www.blueberries.gg/weapons/destiny-2-weapons-list/";
const agent = "GodRollIndexer/1.0 (personal, non-commercial index; contact repository owner)";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let lastRequestAt = 0;
async function politeFetch(url) {
  const wait = delayMs - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  return fetch(url, { headers: { "user-agent": agent, accept: "text/html,application/json" } });
}
async function fetchPage(page) {
  const url = new URL(endpoint);
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));
  url.searchParams.set("_fields", "id,slug,link,date,modified,title,content");
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await politeFetch(url);
    if (response.ok) return { posts: await response.json(), totalPages: Number(response.headers.get("x-wp-totalpages")) };
    if (![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    await sleep(delayMs * 2 ** attempt);
  }
  throw new Error(`Failed to fetch page ${page} after retries`);
}

let previous = { weapons: [], scrape: {} };
if (values.resume && !values.fresh) try { previous = JSON.parse(await readFile(output, "utf8")); } catch {}
const indexed = new Map(previous.weapons.map((item) => [item.source.postId, item]));
const apiPostsByUrl = new Map();
let totalPages = Infinity;
const apiCandidatesWithoutRolls = [];

for (let page = 1; page <= Math.min(totalPages, pageLimit); page++) {
  const result = await fetchPage(page);
  totalPages = result.totalPages;
  for (const post of result.posts) {
    const title = text(post.title.rendered);
    apiPostsByUrl.set(post.link, { post, title, rolls: parseGodRolls(post.content.rendered) });
    const likelyRoll = /god\s*roll|best\s*roll/i.test(title + " " + post.content.rendered);
    if (!likelyRoll) continue;
    if (/\/armor\//i.test(post.link)) continue;
    const rolls = apiPostsByUrl.get(post.link).rolls;
    if (!rolls.length) {
      if (/\/weapons\//i.test(post.link)) apiCandidatesWithoutRolls.push({ title, url: post.link });
      continue;
    }
    indexed.set(post.id, {
      id: post.slug,
      weapon: weaponName(post.title.rendered, rolls),
      rolls,
      source: { postId: post.id, url: post.link, publishedAt: post.date + "Z", modifiedAt: post.modified + "Z" },
    });
  }
  process.stderr.write(`Fetched page ${page}/${Math.min(totalPages, pageLimit)}; indexed ${indexed.size} weapons\n`);
}

const inventoryResponse = await politeFetch(allWeaponsUrl);
if (!inventoryResponse.ok) throw new Error(`All Weapons HTTP ${inventoryResponse.status}`);
const inventory = parseWeaponDatabase(await inventoryResponse.text());
if (!inventory.length) throw new Error("All Weapons table was not found or contained no rows");
const designatedUrls = [...new Set(inventory.map((item) => item.designatedPageUrl).filter(Boolean))];
const designatedUrlsMissingFromApi = designatedUrls.filter((url) => !apiPostsByUrl.has(url));
const designatedFetchFailures = [];
for (const url of designatedUrlsMissingFromApi) {
  const response = await politeFetch(url);
  if (!response.ok) { designatedFetchFailures.push({ url, reason: `HTTP ${response.status}` }); continue; }
  const html = await response.text();
  const rolls = parseGodRolls(html);
  const meta = parseArticleMetadata(html, url);
  if (!rolls.length) { designatedFetchFailures.push({ url, reason: "No structured roll or perk pool found" }); continue; }
  const key = meta.postId ?? `inventory:${url}`;
  indexed.set(key, {
    id: new URL(url).pathname.split("/").filter(Boolean).at(-1),
    weapon: weaponName(meta.title, rolls),
    rolls,
    source: { postId: meta.postId, url, publishedAt: meta.publishedAt, modifiedAt: meta.modifiedAt },
  });
}

// The Finder is a second discovery source. It can retain legacy guides that are
// absent from normal REST pagination, so fetch only Finder URLs not seen above.
const finderResponse = await politeFetch(finderUrl);
if (!finderResponse.ok) throw new Error(`Finder HTTP ${finderResponse.status}`);
const finderLinks = parseFinderLinks(await finderResponse.text());
const indexedUrls = new Set([...indexed.values()].map((item) => item.source.url));
const missingFinderLinks = finderLinks.filter((item) => !indexedUrls.has(item.url));
const finderFailures = [];
for (const item of missingFinderLinks) {
  const response = await politeFetch(item.url);
  if (!response.ok) { finderFailures.push({ ...item, reason: `HTTP ${response.status}` }); continue; }
  const html = await response.text();
  const rolls = parseGodRolls(html);
  if (!rolls.length) { finderFailures.push({ ...item, reason: "No structured roll or perk pool found" }); continue; }
  const meta = parseArticleMetadata(html, item.url);
  const key = meta.postId ?? `finder:${item.url}`;
  indexed.set(key, {
    id: new URL(item.url).pathname.split("/").filter(Boolean).at(-1),
    weapon: item.weapon || weaponName(meta.title, rolls),
    rolls,
    source: { postId: meta.postId, url: item.url, publishedAt: meta.publishedAt, modifiedAt: meta.modifiedAt },
  });
}

const indexedByUrl = new Map([...indexed.values()].map((item) => [item.source.url, item]));
const normalizeIdentity = (value) => value.toLowerCase().replace(/^destiny\s*2\s*/i, "").replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "");
const editDistance = (a, b) => {
  const row = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
};
const sameWeapon = (inventoryName, guideName) => {
  const a = normalizeIdentity(inventoryName).replace(/brave$/, "");
  const b = normalizeIdentity(guideName).replace(/brave$/, "");
  return a === b
    || (Math.min(a.length, b.length) >= 6 && (a.includes(b) || b.includes(a)))
    || (Math.min(a.length, b.length) >= 8 && editDistance(a, b) <= 2)
    || a === b + "off";
};
const weapons = inventory.map((row) => {
  const guide = row.designatedPageUrl ? indexedByUrl.get(row.designatedPageUrl) : null;
  const pageRecord = row.designatedPageUrl ? apiPostsByUrl.get(row.designatedPageUrl) : null;
  const detectedWeapon = guide?.weapon ?? (pageRecord ? weaponName(pageRecord.title, pageRecord.rolls) : null);
  const identityMatches = detectedWeapon && sameWeapon(row.weapon, detectedWeapon);
  let rollStatus = "available";
  if (!row.designatedPageUrl) rollStatus = "no_designated_page";
  else if (detectedWeapon && !identityMatches) rollStatus = "designated_page_mismatch";
  else if (!guide) rollStatus = "designated_page_without_structured_roll";
  return {
    id: row.weapon.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    weapon: row.weapon,
    type: row.type,
    ammo: row.ammo,
    element: row.element,
    tier: row.tier,
    excels: row.excels,
    acquisitionSource: row.source,
    lastUpdate: row.lastUpdate,
    image: row.image,
    rollStatus,
    rolls: rollStatus === "available" ? guide.rolls : [],
    designatedPage: row.designatedPageUrl ? {
      url: row.designatedPageUrl,
      ...(guide ? { postId: guide.source.postId, publishedAt: guide.source.publishedAt, modifiedAt: guide.source.modifiedAt } : {}),
      ...(detectedWeapon ? { detectedWeapon } : {}),
    } : null,
  };
});
const statusCounts = Object.fromEntries([...Map.groupBy(weapons, (item) => item.rollStatus)].map(([status, items]) => [status, items.length]));
const database = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  source: { name: "Blueberries.gg", inventoryUrl: allWeaponsUrl, rollsUrl: finderUrl, attributionRequired: true },
  scrape: {
    completedPages: Math.min(totalPages, pageLimit), totalPages, crawlDelayMs: delayMs,
    finderLinks: finderLinks.length,
    finderLinksMissingAfterApi: missingFinderLinks.length,
    finderFailures,
    apiCandidatesWithoutRolls,
    inventoryRows: inventory.length,
    designatedPages: designatedUrls.length,
    designatedUrlsMissingFromApi: designatedUrlsMissingFromApi.length,
    designatedFetchFailures,
  },
  count: weapons.length,
  countWithGodRolls: statusCounts.available ?? 0,
  rollStatusCounts: statusCounts,
  weapons,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output + ".tmp", JSON.stringify(database, null, 2) + "\n");
await rename(output + ".tmp", output);
console.log(`Wrote ${weapons.length} god-roll entries to ${output}`);
