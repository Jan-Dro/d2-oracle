#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { mergeRecommendations, normalizeWeaponName, parseWishlist } from "./wishlist.mjs";

const { values } = parseArgs({ options: {
  file: { type: "string", short: "f", default: "data/god-rolls.json" },
  "dim-file": { type: "string" }, "aegis-file": { type: "string" },
  "manifest-db": { type: "string" },
}});
const databasePath = resolve(values.file);
const DIM_URL = "https://raw.githubusercontent.com/48klocs/dim-wish-list-sources/master/voltron.txt";
const AEGIS_URL = "https://raw.githubusercontent.com/JxPv2/D2-Stuff/main/dim_wishlists/aegis_endgame_spreadsheet_dim_wishlist.txt";
const providers = {
  dim: { id: "dim-voltron", label: "DIM Voltron", recommendationType: "community_curated", sourceUrl: "https://github.com/48klocs/dim-wish-list-sources", license: "MIT" },
  aegis: { id: "aegis-endgame", label: "Aegis Endgame", recommendationType: "expert_curated_pve", sourceUrl: "https://github.com/JxPv2/D2-Stuff/tree/main/dim_wishlists", license: "GPL-3.0", defaultMode: "PvE" },
};

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "GodRollIndexer/2.1", accept: "text/plain" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

async function fetchBytes(url) {
  const response = await fetch(url, { headers: { "user-agent": "GodRollIndexer/2.1" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function getManifestDatabase() {
  if (values["manifest-db"]) return resolve(values["manifest-db"]);
  const manifest = JSON.parse((await fetchBytes("https://www.bungie.net/Platform/Destiny2/Manifest/")).toString("utf8"));
  const path = manifest.Response?.mobileWorldContentPaths?.en;
  if (!path) throw new Error("Bungie manifest did not include an English world-content path");
  const directory = await mkdtemp(join(tmpdir(), "god-roll-manifest-"));
  const archive = join(directory, "manifest.zip");
  await writeFile(archive, await fetchBytes(`https://www.bungie.net${path}`));
  execFileSync("unzip", ["-o", archive, "-d", directory], { stdio: "ignore" });
  const file = (await readdir(directory)).find((name) => name.endsWith(".content") && name !== "manifest.zip");
  if (!file) throw new Error("Bungie manifest archive contained no .content database");
  return join(directory, file);
}

function loadDefinitions(manifestDb) {
  const sql = `select json_extract(d.json,'$.hash'), replace(replace(json_extract(d.json,'$.displayProperties.name'),char(9),' '),char(10),' '), replace(replace(json_extract(d.json,'$.itemTypeDisplayName'),char(9),' '),char(10),' '), coalesce(json_extract(d.json,'$.plug.plugCategoryIdentifier'),''), coalesce(json_extract(d.json,'$.inventory.tierTypeName'),''), json_extract(d.json,'$.itemType'), (select count(*) from json_each(d.json,'$.sockets.socketEntries') s where json_extract(s.value,'$.randomizedPlugSetHash') is not null), coalesce((select group_concat(json_extract(s.value,'$.singleInitialItemHash'),',') from json_each(d.json,'$.sockets.socketEntries') s where coalesce(json_extract(s.value,'$.singleInitialItemHash'),0) != 0),''), coalesce((select group_concat(json_extract(p.value,'$.plugItemHash'),',') from json_each(d.json,'$.sockets.socketEntries') s, json_each(s.value,'$.reusablePlugItems') p where coalesce(json_extract(p.value,'$.plugItemHash'),0) != 0),''), coalesce(json_extract(d.json,'$.displayProperties.icon'),''), coalesce(json_extract(d.json,'$.screenshot'),'') from DestinyInventoryItemDefinition d;`;
  const output = execFileSync("sqlite3", [manifestDb, sql], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const definitions = new Map();
  for (const line of output.trim().split("\n")) {
    const [hash, name, type, category, rarity, itemType, randomizedSockets, fixedHashes, reusableHashes, icon, screenshot] = line.split("|");
    definitions.set(hash, { hash, name, type, category, rarity, itemType: Number(itemType), randomizedSockets: Number(randomizedSockets), fixedPlugHashes: (fixedHashes ?? "").split(",").filter((value) => value && value !== "0"), reusablePlugHashes: (reusableHashes ?? "").split(",").filter((value) => value && value !== "0"), icon, screenshot });
  }
  return definitions;
}

const [dimText, aegisText, manifestDb] = await Promise.all([
  values["dim-file"] ? readFile(resolve(values["dim-file"]), "utf8") : fetchText(DIM_URL),
  values["aegis-file"] ? readFile(resolve(values["aegis-file"]), "utf8") : fetchText(AEGIS_URL),
  getManifestDatabase(),
]);
const definitions = loadDefinitions(manifestDb);
const dim = mergeRecommendations(parseWishlist(dimText, definitions, providers.dim));
const aegis = mergeRecommendations(parseWishlist(aegisText, definitions, providers.aegis));
const dimByWeapon = Map.groupBy(dim, (roll) => roll.normalizedWeapon);
const aegisByWeapon = Map.groupBy(aegis, (roll) => roll.normalizedWeapon);
const weaponDefsByName = new Map();
for (const definition of definitions.values()) {
  // Type 30 definitions are shaped/crafting templates. They carry the full
  // configurable socket choices while the matching type 3 definition is the
  // inventory instance players own.
  if (![3, 30].includes(definition.itemType) || !definition.name) continue;
  const key = normalizeWeaponName(definition.name);
  const current = weaponDefsByName.get(key) ?? [];
  current.push(definition);
  weaponDefsByName.set(key, current);
}

const database = JSON.parse(await readFile(databasePath, "utf8"));
const aliases = new Map([
  [normalizeWeaponName("Anonymous Autum"), normalizeWeaponName("Anonymous Autumn")],
  [normalizeWeaponName("Sovereignity"), normalizeWeaponName("Sovereignty")],
  [normalizeWeaponName("Summun Bonun"), normalizeWeaponName("Summum Bonum")],
]);
const bungieAsset = (path) => path ? `https://www.bungie.net${path}` : null;
function enrichImages(weapon, manifestDefinitions) {
  const referencedHashes = new Set(weapon.rolls.flatMap((roll) => roll.provenance?.itemHashes ?? []).map(String));
  const rarityRank = { Exotic: 4, Legendary: 3, Rare: 2, Uncommon: 1, Common: 0 };
  const definition = [...manifestDefinitions].filter((item) => item.itemType === 3).sort((a, b) =>
    Number(referencedHashes.has(b.hash)) - Number(referencedHashes.has(a.hash)) ||
    Number(Boolean(b.screenshot)) - Number(Boolean(a.screenshot)) ||
    (rarityRank[b.rarity] ?? -1) - (rarityRank[a.rarity] ?? -1) ||
    Number(b.hash) - Number(a.hash)
  )[0];
  const blueberries = weapon.images?.blueberries ?? (/blueberries\.gg/i.test(weapon.image ?? "") ? weapon.image : null);
  const screenshot = bungieAsset(definition?.screenshot);
  const icon = bungieAsset(definition?.icon);
  const primary = screenshot ?? icon ?? blueberries ?? weapon.image ?? null;
  weapon.images = { primary, screenshot, icon, blueberries };
  weapon.image = primary;
  weapon.imageSource = screenshot || icon ? "bungie-manifest" : blueberries ? "blueberries-gg" : null;
  weapon.imageItemHash = definition?.hash ?? null;
}
function fixedRollFromDefinitions(manifestDefinitions) {
  const rarityRank = { Exotic: 4, Legendary: 3, Rare: 2, Uncommon: 1, Common: 0 };
  const weaponDefinition = [...manifestDefinitions].sort((a, b) =>
    (rarityRank[b.rarity] ?? -1) - (rarityRank[a.rarity] ?? -1) || b.fixedPlugHashes.length - a.fixedPlugHashes.length
  )[0];
  if (!weaponDefinition) return null;
  const plugs = weaponDefinition.fixedPlugHashes.map((hash) => definitions.get(hash)).filter(Boolean).filter((plug) => {
    const value = `${plug.type} ${plug.category} ${plug.name}`;
    if (/ornament|tracker|shader|default ornament|upgrade masterwork/i.test(value)) return false;
    return /barrel|magazine|battery|bowstring|string|arrow|blade|guard|haft|grip|stock|scope|sight|trait|intrinsic|frame|catalyst/i.test(value);
  });
  const fields = {};
  const traits = plugs.filter((plug) => /trait|frames/i.test(`${plug.type} ${plug.category}`));
  let traitNumber = 0;
  for (const plug of plugs) {
    const value = `${plug.type} ${plug.category}`;
    let field;
    if (/trait|frames/i.test(value)) field = traits.length > 1 ? `Perk ${++traitNumber}` : "Perk";
    else if (/intrinsic|frame/i.test(value)) field = "Intrinsic";
    else if (/barrel/i.test(value)) field = "Barrel";
    else if (/magazine/i.test(value)) field = "Magazine";
    else if (/battery/i.test(value)) field = "Battery";
    else if (/bowstring|string/i.test(value)) field = "Bowstring";
    else if (/arrow/i.test(value)) field = "Arrow";
    else if (/blade/i.test(value)) field = "Blade";
    else if (/guard/i.test(value)) field = "Guard";
    else if (/haft/i.test(value)) field = "Haft";
    else if (/grip/i.test(value)) field = "Grip";
    else if (/stock/i.test(value)) field = "Stock";
    else if (/scope/i.test(value)) field = "Scope";
    else if (/sight/i.test(value)) field = "Sight";
    else if (/catalyst/i.test(`${value} ${plug.name}`)) field = "Catalyst";
    if (!field) continue;
    fields[field] ??= [];
    if (!fields[field].includes(plug.name)) fields[field].push(plug.name);
  }
  if (!Object.keys(fields).length) return null;
  return {
    mode: "general",
    heading: `${weaponDefinition.name} fixed roll`,
    fields,
    provenance: {
      provider: "bungie-manifest",
      recommendationType: "authoritative_fixed_roll",
      sourceUrl: "https://www.bungie.net/Platform/Destiny2/Manifest/",
      itemHashes: [weaponDefinition.hash],
      perkHashes: plugs.map((plug) => plug.hash),
    },
  };
}
function configurableRollFromDefinitions(manifestDefinitions) {
  const weaponDefinition = [...manifestDefinitions].sort((a, b) => b.reusablePlugHashes.length - a.reusablePlugHashes.length)[0];
  if (!weaponDefinition?.reusablePlugHashes.length) return null;
  const synthetic = { ...weaponDefinition, fixedPlugHashes: [...new Set([...weaponDefinition.fixedPlugHashes, ...weaponDefinition.reusablePlugHashes])] };
  const roll = fixedRollFromDefinitions([synthetic]);
  if (!roll) return null;
  roll.heading = `${weaponDefinition.name} configurable roll options`;
  roll.provenance.recommendationType = "authoritative_configurable_options";
  return roll;
}
let dimWeapons = 0, aegisWeapons = 0, staticWeapons = 0, unresolvedWeapons = 0;
for (const weapon of database.weapons) {
  for (const roll of weapon.rolls) roll.provenance ??= { provider: "blueberries-gg", recommendationType: "editorial", sourceUrl: weapon.designatedPage?.url ?? database.source.inventoryUrl };
  if (weapon.rollStatus === "available") continue;
  const originalKey = normalizeWeaponName(weapon.weapon);
  const key = aliases.get(originalKey) ?? originalKey;
  const imported = [];
  const dimRolls = dimByWeapon.get(key) ?? [];
  if (dimRolls.length) imported.push(...dimRolls);
  const hasPve = imported.some((roll) => roll.mode === "pve" || roll.mode === "general");
  const aegisRolls = (aegisByWeapon.get(key) ?? []).filter((roll) => Object.keys(roll.fields).length > 0);
  if (!hasPve && aegisRolls.length) imported.push(...aegisRolls.filter((roll) => roll.mode === "pve" || roll.mode === "general"));
  if (imported.length) {
    weapon.rolls = imported.map(({ normalizedWeapon, weapon: ignored, sourceHeadings, ...roll }) => roll);
    weapon.rollStatus = "available_fallback";
    weapon.recommendationProviders = [...new Set(weapon.rolls.map((roll) => roll.provenance.provider))];
    if (dimRolls.length) dimWeapons++; else aegisWeapons++;
    continue;
  }
  const manifestDefinitions = weaponDefsByName.get(key) ?? [];
  const hasRandomRoll = manifestDefinitions.some((definition) => definition.randomizedSockets > 0);
  if (!hasRandomRoll && manifestDefinitions.length) {
    const fixedRoll = fixedRollFromDefinitions(manifestDefinitions);
    weapon.rolls = fixedRoll ? [fixedRoll] : [];
    weapon.rollStatus = fixedRoll ? "fixed_roll" : "static_roll_not_applicable";
    weapon.recommendationProviders = ["bungie-manifest"];
    const context = (aegisByWeapon.get(key) ?? []).filter((roll) => !Object.keys(roll.fields).length).map((roll) => ({
      mode: roll.mode, notes: roll.notes, provenance: roll.provenance,
    }));
    if (context.length) weapon.recommendationContext = context;
    staticWeapons++;
  } else {
    const configurableRoll = configurableRollFromDefinitions(manifestDefinitions);
    if (configurableRoll) {
      weapon.rolls = [configurableRoll];
      weapon.rollStatus = "configurable_roll_options";
      weapon.recommendationProviders = ["bungie-manifest"];
      const context = (aegisByWeapon.get(key) ?? []).filter((roll) => !Object.keys(roll.fields).length).map((roll) => ({ mode: roll.mode, notes: roll.notes, provenance: roll.provenance }));
      if (context.length) weapon.recommendationContext = context;
    } else {
      weapon.rollStatus = "no_recommendation_found";
      unresolvedWeapons++;
    }
  }
}
for (const weapon of database.weapons) {
  const originalKey = normalizeWeaponName(weapon.weapon);
  const key = aliases.get(originalKey) ?? originalKey;
  enrichImages(weapon, weaponDefsByName.get(key) ?? []);
}
database.schemaVersion = 3;
database.generatedAt = new Date().toISOString();
database.enrichment = {
  generatedAt: database.generatedAt,
  precedence: ["blueberries-gg", "dim-voltron", "aegis-endgame", "bungie-manifest"],
  sources: [
    { ...providers.dim, dataUrl: DIM_URL },
    { ...providers.aegis, dataUrl: AEGIS_URL },
    { id: "bungie-manifest", recommendationType: "authoritative_item_metadata", sourceUrl: "https://www.bungie.net/Platform/Destiny2/Manifest/" },
  ],
  added: { dimWeapons, aegisWeapons, staticWeapons, unresolvedWeapons },
};
database.rollStatusCounts = Object.fromEntries([...Map.groupBy(database.weapons, (weapon) => weapon.rollStatus)].map(([status, weapons]) => [status, weapons.length]));
database.countWithGodRolls = database.weapons.filter((weapon) => weapon.rollStatus === "available" || weapon.rollStatus === "available_fallback").length;
database.countWithRollData = database.weapons.filter((weapon) => weapon.rolls.length > 0).length;
database.imageCounts = {
  bungieScreenshots: database.weapons.filter((weapon) => weapon.images.screenshot).length,
  bungieIcons: database.weapons.filter((weapon) => weapon.images.icon).length,
  blueberriesFallbacks: database.weapons.filter((weapon) => weapon.imageSource === "blueberries-gg").length,
  missing: database.weapons.filter((weapon) => !weapon.image).length,
};
await writeFile(databasePath + ".tmp", JSON.stringify(database, null, 2) + "\n");
await rename(databasePath + ".tmp", databasePath);
console.log(JSON.stringify({ count: database.count, countWithGodRolls: database.countWithGodRolls, rollStatusCounts: database.rollStatusCounts, imageCounts: database.imageCounts, added: database.enrichment.added }, null, 2));
