import test from "node:test";
import assert from "node:assert/strict";
import { parseArticleMetadata, parseFinderLinks, parseGodRolls, parseWeaponDatabase, weaponName } from "../src/parser.mjs";

test("extracts PvE and PvP rolls from article lists", () => {
  const html = `<h3>Example PvE god roll</h3><ul><li><strong>Barrel</strong>: Corkscrew Rifling</li><li><strong>Perk 1</strong>: Demo or Stats</li></ul><p>x</p><h3>Example PvP god roll</h3><ul><li><strong>Magazine</strong>: Accurized Rounds (also good: Ricochet Rounds)</li></ul>`;
  assert.deepEqual(parseGodRolls(html), [
    { mode: "pve", heading: "Example PvE god roll", fields: { Barrel: ["Corkscrew Rifling"], "Perk 1": ["Demo", "Stats"] } },
    { mode: "pvp", heading: "Example PvP god roll", fields: { Magazine: ["Accurized Rounds", "Ricochet Rounds"] } },
  ]);
});

test("normalizes a weapon article title", () => {
  assert.equal(weaponName("Destiny 2 Word of Crota: God Rolls &amp; How to get it"), "Word of Crota");
  assert.equal(weaponName("Destiny 2 Dead Messenger: How to get it and God Rolls"), "Dead Messenger");
  assert.equal(weaponName("Hawthorne’s Field-Forged Shotgun God Rolls &amp; How to get it"), "Hawthorne’s Field-Forged Shotgun");
});

test("splits comma-delimited perk pools", () => {
  const [roll] = parseGodRolls("<h2>Example Perks and God Rolls</h2><ul><li><b>Perk 1</b>: Subsistence, Rangefinder, Killing Wind</li></ul>");
  assert.deepEqual(roll.fields["Perk 1"], ["Subsistence", "Rangefinder", "Killing Wind"]);
});

test("captures a perk-pool-only legacy guide", () => {
  const [roll] = parseGodRolls("<h2>D.F.A Perks</h2><ul><li><strong>Perk 1</strong>: Outlaw, Rapid Hit.</li><li><strong>Perk 2</strong>: Kill Clip</li></ul><h2>D.F.A PvE &amp; PvP god roll</h2><p>Pending</p>");
  assert.deepEqual(roll, { mode: "general", heading: "D.F.A Perks", fields: { "Perk 1": ["Outlaw", "Rapid Hit"], "Perk 2": ["Kill Clip"] } });
});

test("discovers Finder links and article metadata", () => {
  const html = `<title>Destiny 2 Example: God Rolls</title><link href="https://www.blueberries.gg/wp-json/wp/v2/posts/42"><meta property="article:modified_time" content="2026-01-02T03:04:05+00:00"><a href="https://www.blueberries.gg/weapons/example-god-rolls/">Example</a>`;
  assert.deepEqual(parseFinderLinks(html), [{ url: "https://www.blueberries.gg/weapons/example-god-rolls/", weapon: "Example" }]);
  assert.equal(parseArticleMetadata(html, "https://example.test").postId, 42);
});

test("does not mistake ranking tables for weapon rolls", () => {
  assert.deepEqual(parseGodRolls("<h2>All Weapons God Rolls</h2><table><tr><th>Art</th><th>Name</th><th>Type</th></tr><tr><td>x</td><td>Example</td><td>Rifle</td></tr></table>"), []);
});

test("parses canonical All Weapons rows", () => {
  const html = `<table><tr><th>Art</th><th>Name</th><th>Type</th><th>Ammo</th><th>Element</th><th>Tier</th><th>Excels</th><th>Source</th><th>Last Update</th></tr><tr><td><img data-src="https://img.test/gun.jpg"></td><td><a href="https://www.blueberries.gg/weapons/example-god-rolls/">Example</a></td><td>Auto Rifle</td><td>Primary</td><td>Solar</td><td>A › Strong</td><td>PvE + PvP</td><td>Raid</td><td>Season 1</td></tr></table>`;
  assert.deepEqual(parseWeaponDatabase(html)[0], {
    inventoryIndex: 1, weapon: "Example", type: "Auto Rifle", ammo: "Primary", element: "Solar",
    tier: { rank: "A", label: "A › Strong" }, excels: ["PvE", "PvP"], source: "Raid", lastUpdate: "Season 1",
    image: "https://img.test/gun.jpg", designatedPageUrl: "https://www.blueberries.gg/weapons/example-god-rolls/",
  });
});
