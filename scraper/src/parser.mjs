const entities = {
  amp: "&", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  bull: "•", middot: "·", raquo: "»", laquo: "«",
};

export function decodeHtml(value = "") {
  return value
    .replace(/&#(x[0-9a-f]+|\d+);?/gi, (_, code) =>
      String.fromCodePoint(code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code)))
    .replace(/&([a-z]+);/gi, (all, name) => entities[name.toLowerCase()] ?? all);
}

export function text(value = "") {
  return decodeHtml(value)
    .replace(/<br\s*\/?\s*>/gi, " / ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitChoices(value) {
  const cleaned = value.replace(/\s*\((?:also good|alternatives?|or)\s*:\s*([^)]*)\)/gi, " or $1");
  return cleaned.split(/\s+(?:or|\/)\s+|\s*[,;|→]\s*/i)
    .map((v) => v.trim().replace(/[.\s]+$/, ""))
    .filter(Boolean);
}

function parseList(html) {
  const fields = {};
  for (const match of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const item = match[1];
    const strong = item.match(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>\s*:?[\s\S]*/i);
    const line = text(item);
    const colon = line.indexOf(":");
    const label = text(strong?.[1] ?? (colon >= 0 ? line.slice(0, colon) : ""));
    const value = colon >= 0 ? line.slice(colon + 1).trim() : line.replace(label, "").replace(/^\s*:\s*/, "");
    if (label && value) fields[label] = splitChoices(value);
  }
  return fields;
}

function parseTable(html) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => text(cell[1]))
  ).filter((row) => row.length >= 2);
  if (!rows.length) return {};
  const fields = {};
  for (const row of rows) {
    const label = row[0].replace(/:$/, "").trim();
    if (label && row[1]) fields[label] = splitChoices(row.slice(1).join(" / "));
  }
  return fields;
}

function modeFromHeading(heading) {
  if (/pve/i.test(heading)) return "pve";
  if (/pvp|crucible/i.test(heading)) return "pvp";
  return "general";
}

function hasRollFields(fields) {
  return Object.keys(fields).some((key) => /^(?:barrel|magazine|mag|perk\s*\d*|trait\s*\d*|origin trait|masterwork|stock|battery|arrow|bowstring|string|guard|blade|haft|catalyst|mod)$/i.test(key.trim()));
}

export function parseGodRolls(html) {
  const headings = [...html.matchAll(/<h([2-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  const rolls = [];
  for (let i = 0; i < headings.length; i++) {
    const heading = text(headings[i][2]);
    const isRollHeading = /(?:god|best|recommended|ideal)\s+roll|roll\s+(?:for\s+)?(?:pve|pvp)|pve\s+(?:and|&|\/)\s+pvp/i.test(heading);
    const isPerkPoolHeading = /\bperks?\b/i.test(heading);
    if (!isRollHeading && !isPerkPoolHeading) continue;
    const start = headings[i].index + headings[i][0].length;
    const end = headings[i + 1]?.index ?? html.length;
    const section = html.slice(start, end);
    const list = section.match(/<(?:ul|ol)\b[^>]*>[\s\S]*?<\/(?:ul|ol)>/i)?.[0];
    const table = section.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0];
    const fields = list ? parseList(list) : table ? parseTable(table) : {};
    if (Object.keys(fields).length && hasRollFields(fields)) {
      rolls.push({ mode: modeFromHeading(heading), heading, fields });
    }
  }
  return rolls;
}

export function parseFinderLinks(html) {
  const links = new Map();
  for (const match of html.matchAll(/<a\b[^>]*href=["'](https:\/\/www\.blueberries\.gg\/weapons\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = match[1].replace(/\?.*$/, "").replace(/\/$/, "") + "/";
    if (!/(?:god-roll|weapon-roll)/i.test(url)) continue;
    const name = text(match[2]);
    if (name) links.set(url, name);
  }
  return [...links].map(([url, weapon]) => ({ url, weapon }));
}

export function parseArticleMetadata(html, url) {
  const title = text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s*\|\s*BlueberriesGG.*$/i, "");
  const postId = Number(html.match(/wp-json\/wp\/v2\/posts\/(\d+)/i)?.[1]) || null;
  const publishedAt = html.match(/property=["']article:published_time["'][^>]*content=["']([^"']+)/i)?.[1] ?? null;
  const modifiedAt = html.match(/property=["']article:modified_time["'][^>]*content=["']([^"']+)/i)?.[1] ?? null;
  return { postId, url, title, publishedAt, modifiedAt };
}

export function parseWeaponDatabase(html) {
  const table = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)]
    .map((match) => match[0])
    .find((candidate) => /<th\b[^>]*>\s*Name\s*<\/th>/i.test(candidate) && /<th\b[^>]*>\s*Type\s*<\/th>/i.test(candidate));
  if (!table) return [];
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(1);
  return rows.map((row, index) => {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cell[1]);
    if (cells.length < 9) return null;
    const link = cells[1].match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1] ?? null;
    const image = cells[0].match(/(?:data-src|src)=["'](https?:\/\/[^"']+)["']/i)?.[1] ?? null;
    const tierText = text(cells[5]);
    return {
      inventoryIndex: index + 1,
      weapon: text(cells[1]),
      type: text(cells[2]),
      ammo: text(cells[3]),
      element: text(cells[4]),
      tier: tierText === "-" ? null : { rank: tierText.match(/^[SABCD][+]?/i)?.[0]?.toUpperCase() ?? null, label: tierText },
      excels: text(cells[6]) === "-" ? [] : text(cells[6]).split(/\s*\+\s*/).filter(Boolean),
      source: text(cells[7]),
      lastUpdate: text(cells[8]),
      image,
      designatedPageUrl: link ? decodeHtml(link).replace(/\?.*$/, "").replace(/\/$/, "") + "/" : null,
    };
  }).filter((row) => row?.weapon);
}

export function weaponName(title, rolls = []) {
  const cleaned = text(title)
    .replace(/(?:\s*[:–—]\s*|\s+-\s+)[^:–—]*(?:how to get|god rolls?)[\s\S]*$/i, "")
    .replace(/^Destiny\s*2\s*/i, "")
    .replace(/\s*[:–—-]\s*(?:God Rolls?|Best Rolls?)[\s\S]*$/i, "")
    .replace(/\s+(?:God Rolls?|Best Rolls?)[\s\S]*$/i, "")
    .trim();
  if (cleaned && !/^best\b/i.test(cleaned)) return cleaned;
  const heading = rolls[0]?.heading ?? "";
  return heading.replace(/\s+(?:pve|pvp)?\s*(?:god|best)\s+roll[\s\S]*$/i, "").trim() || cleaned;
}
