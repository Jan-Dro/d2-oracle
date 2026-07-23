#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  file: { type: "string", short: "f", default: "data/god-rolls.json" },
  mode: { type: "string", short: "m" }, json: { type: "boolean", default: false },
}});
const query = positionals.join(" ").trim().toLowerCase();
if (!query) throw new Error("Usage: npm run query -- <weapon name> [-- --mode pve --json]");
const database = JSON.parse(await readFile(values.file, "utf8"));
const matches = database.weapons.filter((item) => item.weapon.toLowerCase().includes(query));
const selected = matches.map((item) => ({ ...item, rolls: values.mode ? item.rolls.filter((r) => r.mode === values.mode.toLowerCase()) : item.rolls }));
if (values.json) console.log(JSON.stringify(selected, null, 2));
else for (const item of selected) {
  console.log(`\n${item.weapon} — ${item.rollStatus ?? "available"}`);
  if (item.designatedPage?.url) console.log(item.designatedPage.url);
  else if (item.source?.url) console.log(item.source.url);
  for (const roll of item.rolls) {
    console.log(`  ${roll.mode.toUpperCase()}`);
    for (const [slot, perks] of Object.entries(roll.fields)) console.log(`    ${slot}: ${perks.join(" | ")}`);
  }
}
if (!selected.length) process.exitCode = 1;
