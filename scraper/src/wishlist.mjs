export function normalizeWeaponName(value) {
  return value.toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s*\(brave\)$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

function modeFromText(value) {
  const pve = /\bpve\b/i.test(value);
  const pvp = /\bpvp\b/i.test(value);
  if (pve && !pvp) return "pve";
  if (pvp && !pve) return "pvp";
  return "general";
}

function fieldLabel(definition, traitNumber, traitTotal) {
  const type = definition?.type?.trim() || "Unknown";
  const category = definition?.category || "";
  if (/trait/i.test(type) || /trait/i.test(category) || /frames/i.test(category)) {
    return traitTotal > 1 ? `Perk ${traitNumber}` : "Perk";
  }
  if (/barrel/i.test(type + category)) return "Barrel";
  if (/magazine|magazines/i.test(type + category)) return "Magazine";
  if (/battery/i.test(type + category)) return "Battery";
  if (/bowstring|string/i.test(type + category)) return "Bowstring";
  if (/arrow/i.test(type + category)) return "Arrow";
  if (/blade/i.test(type + category)) return "Blade";
  if (/guard/i.test(type + category)) return "Guard";
  if (/haft/i.test(type + category)) return "Haft";
  if (/grip/i.test(type + category)) return "Grip";
  if (/stock/i.test(type + category)) return "Stock";
  if (/catalyst/i.test(type + category)) return "Catalyst";
  return type === "Unknown" ? "Perk" : type;
}

function addUnique(object, key, value) {
  if (!value) return;
  object[key] ??= [];
  if (!object[key].includes(value)) object[key].push(value);
}

export function parseWishlist(text, definitions, provider) {
  const recommendations = [];
  for (const rawBlock of text.split(/\r?\n\s*\r?\n/)) {
    const wishlistLines = [...rawBlock.matchAll(/^dimwishlist:item=(\d+)(?:&perks=([^#\s]*))?/gm)];
    if (!wishlistLines.length) continue;
    const notes = rawBlock.match(/^\/\/notes:(.*)$/m)?.[1]?.trim() ?? "";
    const comments = [...rawBlock.matchAll(/^\/\/\s*(?!notes:)(.+)$/gm)].map((match) => match[1].trim());
    const headingHint = comments.find((line) => !line.startsWith("(")) ?? "Community recommendation";
    const mode = modeFromText(`${notes} ${headingHint} ${provider.defaultMode ?? ""}`);
    const byWeapon = new Map();
    for (const match of wishlistLines) {
      const itemHash = match[1];
      const weapon = definitions.get(itemHash);
      if (!weapon?.name) continue;
      const key = normalizeWeaponName(weapon.name);
      const entry = byWeapon.get(key) ?? { weapon: weapon.name, itemHashes: new Set(), perkHashes: new Set(), fields: {} };
      entry.itemHashes.add(itemHash);
      const perkHashes = (match[2] ?? "").split(",").filter(Boolean);
      const perkDefs = perkHashes.map((hash) => definitions.get(hash));
      const traitTotal = perkDefs.filter((def) => /trait/i.test((def?.type ?? "") + (def?.category ?? "")) || /frames/i.test(def?.category ?? "")).length;
      let traitNumber = 0;
      for (let i = 0; i < perkHashes.length; i++) {
        const hash = perkHashes[i];
        const def = perkDefs[i];
        entry.perkHashes.add(hash);
        if (!def?.name) continue;
        const isTrait = /trait/i.test((def?.type ?? "") + (def?.category ?? "")) || /frames/i.test(def?.category ?? "");
        if (isTrait) traitNumber++;
        addUnique(entry.fields, fieldLabel(def, traitNumber, traitTotal), def.name);
      }
      byWeapon.set(key, entry);
    }
    for (const [normalizedWeapon, entry] of byWeapon) {
      recommendations.push({
        normalizedWeapon,
        weapon: entry.weapon,
        mode,
        heading: `${entry.weapon} ${provider.label} ${mode === "general" ? "recommendation" : `${mode.toUpperCase()} recommendation`}`,
        fields: entry.fields,
        notes: notes || undefined,
        provenance: {
          provider: provider.id,
          recommendationType: provider.recommendationType,
          sourceUrl: provider.sourceUrl,
          license: provider.license,
          itemHashes: [...entry.itemHashes],
          perkHashes: [...entry.perkHashes],
        },
      });
    }
  }
  return recommendations;
}

export function mergeRecommendations(recommendations) {
  const merged = new Map();
  for (const recommendation of recommendations) {
    const key = `${recommendation.normalizedWeapon}:${recommendation.mode}:${recommendation.provenance.provider}`;
    const current = merged.get(key) ?? { ...recommendation, fields: {}, provenance: { ...recommendation.provenance, itemHashes: [], perkHashes: [] }, sourceHeadings: [] };
    for (const [field, values] of Object.entries(recommendation.fields)) for (const value of values) addUnique(current.fields, field, value);
    for (const hash of recommendation.provenance.itemHashes) if (!current.provenance.itemHashes.includes(hash)) current.provenance.itemHashes.push(hash);
    for (const hash of recommendation.provenance.perkHashes) if (!current.provenance.perkHashes.includes(hash)) current.provenance.perkHashes.push(hash);
    if (!current.sourceHeadings.includes(recommendation.heading)) current.sourceHeadings.push(recommendation.heading);
    merged.set(key, current);
  }
  return [...merged.values()];
}
