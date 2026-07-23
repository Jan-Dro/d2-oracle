#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { file: { type: "string", short: "f", default: "data/god-rolls.json" } } });
const database = JSON.parse(await readFile(values.file, "utf8"));
const errors = [];
const requireValue = (condition, message) => { if (!condition) errors.push(message); };

requireValue(database.schemaVersion >= 3, "schemaVersion must be at least 3");
requireValue(database.count === database.weapons.length, "count does not match weapons.length");
requireValue(new Set(database.weapons.map((weapon) => weapon.weapon)).size === database.weapons.length, "weapon names are not unique");
requireValue(database.weapons.every((weapon) => weapon.rolls.length > 0), "one or more weapons have no roll/fixed/configurable data");
requireValue(database.weapons.every((weapon) => weapon.rolls.every((roll) => roll.provenance?.provider)), "one or more rolls lack provider provenance");
requireValue(database.weapons.every((weapon) => weapon.rolls.every((roll) => Object.values(roll.fields).every((values) => Array.isArray(values) && values.length > 0))), "one or more roll fields are empty or invalid");
requireValue(!database.weapons.some((weapon) => weapon.rolls.some((roll) => Object.values(roll.fields).flat().some((value) => value.startsWith("Unknown perk")))), "unknown perk placeholders remain");
requireValue(database.weapons.every((weapon) => weapon.image && weapon.images?.primary === weapon.image), "one or more weapons lack a primary image");
requireValue(database.weapons.every((weapon) => weapon.images?.screenshot || weapon.images?.icon || weapon.images?.blueberries), "one or more weapons lack every image fallback");

const mida = database.weapons.find((weapon) => weapon.weapon === "MIDA Multi-Tool");
requireValue(Boolean(mida), "MIDA Multi-Tool is missing");
requireValue(mida?.rollStatus === "fixed_roll", "MIDA Multi-Tool must be classified as fixed_roll");
requireValue(mida?.images?.screenshot?.includes("bungie.net/common/destiny2_content/screenshots/"), "MIDA Multi-Tool is missing its Bungie screenshot");
const midaFields = mida?.rolls[0]?.fields ?? {};
for (const field of ["Intrinsic", "Barrel", "Magazine", "Perk", "Stock", "Catalyst"]) {
  requireValue(Array.isArray(midaFields[field]) && midaFields[field].length > 0, `MIDA Multi-Tool is missing ${field} data`);
}

const computedStatuses = Object.fromEntries([...Map.groupBy(database.weapons, (weapon) => weapon.rollStatus)].map(([status, weapons]) => [status, weapons.length]));
requireValue(JSON.stringify(computedStatuses) === JSON.stringify(database.rollStatusCounts), "rollStatusCounts is stale");
requireValue(database.countWithRollData === database.weapons.filter((weapon) => weapon.rolls.length > 0).length, "countWithRollData is stale");

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  count: database.count,
  countWithGodRolls: database.countWithGodRolls,
  countWithRollData: database.countWithRollData,
  rollStatusCounts: database.rollStatusCounts,
  imageCounts: database.imageCounts,
  midaFields,
}, null, 2));
