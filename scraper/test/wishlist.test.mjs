import test from "node:test";
import assert from "node:assert/strict";
import { mergeRecommendations, parseWishlist } from "../src/wishlist.mjs";

const definitions = new Map([
  ["1", { name: "Example Gun", type: "Auto Rifle", itemType: 3 }],
  ["10", { name: "Arrowhead Brake", type: "Barrel", category: "barrels" }],
  ["11", { name: "Tactical Mag", type: "Magazine", category: "magazines" }],
  ["12", { name: "Good First Perk", type: "Trait", category: "frames" }],
  ["13", { name: "Good Second Perk", type: "Trait", category: "frames" }],
]);
const provider = { id: "test", label: "Test", recommendationType: "test", sourceUrl: "https://example.test", license: "MIT" };

test("parses and collapses DIM wishlist permutations", () => {
  const text = `// Example Gun - PvE god roll\n//notes:Useful roll |tags:PvE\ndimwishlist:item=1&perks=10,11,12,13#notes:inline\ndimwishlist:item=1&perks=10,11,12,13\n\n// Example Gun - PvE alternative\n//notes:Alternative |tags:PvE\ndimwishlist:item=1&perks=10,11,12,13`;
  const merged = mergeRecommendations(parseWishlist(text, definitions, provider));
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].fields, { Barrel: ["Arrowhead Brake"], Magazine: ["Tactical Mag"], "Perk 1": ["Good First Perk"], "Perk 2": ["Good Second Perk"] });
  assert.equal(merged[0].mode, "pve");
});
