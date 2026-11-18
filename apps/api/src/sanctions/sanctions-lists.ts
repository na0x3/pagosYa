/**
 * Sanctions lists (UIF / BCB R.D. 079/2022 due diligence; build order 2026-10-08: sanctions screening at KYC): the UN
 * Security Council consolidated list and the US Treasury OFAC SDN list, parsed into one shape, and the name matcher
 * that screens a merchant's legal name and legal representative against them.
 */
export type SanctionsSourceName = "UN" | "OFAC";

export interface ParsedSanctionsEntry {
  source: SanctionsSourceName;
  externalId: string;
  kind: "individual" | "entity";
  primaryName: string;
  /** The primary name and every alias. */
  names: string[];
  birthDates: string[];
  nationalities: string[];
  programs: string[];
  listedOn: string | null;
}

export const UN_LIST_URL = "https://scsanctions.un.org/resources/xml/en/consolidated.xml";
export const OFAC_SDN_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv";
export const OFAC_ALT_URL = "https://www.treasury.gov/ofac/downloads/alt.csv";

// ---------- UN (XML) ----------

const decodeXml = (text: string) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const tag = (block: string, name: string) => {
  const match = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? decodeXml(match[1].trim()) : "";
};
const blocks = (xml: string, name: string) => xml.match(new RegExp(`<${name}>[\\s\\S]*?</${name}>`, "g")) ?? [];
const values = (block: string, name: string) => blocks(block, name).map((inner) => tag(inner, name)).filter(Boolean);

export function parseUnXml(xml: string): { entries: ParsedSanctionsEntry[]; publishedAt: string | null } {
  const publishedAt = xml.match(/dateGenerated="([^"]+)"/)?.[1] ?? null;
  const entries: ParsedSanctionsEntry[] = [];
  for (const [blockName, aliasName, kind] of [["INDIVIDUAL", "INDIVIDUAL_ALIAS", "individual"], ["ENTITY", "ENTITY_ALIAS", "entity"]] as const) {
    for (const block of blocks(xml, blockName)) {
      const primaryName = ["FIRST_NAME", "SECOND_NAME", "THIRD_NAME", "FOURTH_NAME"].map((name) => tag(block, name)).filter(Boolean).join(" ");
      if (!primaryName) continue;
      const aliases = blocks(block, aliasName).map((alias) => tag(alias, "ALIAS_NAME")).filter(Boolean);
      const births = blocks(block, "INDIVIDUAL_DATE_OF_BIRTH").map((dob) => tag(dob, "DATE") || tag(dob, "YEAR") || [tag(dob, "FROM_YEAR"), tag(dob, "TO_YEAR")].filter(Boolean).join("–")).filter(Boolean);
      entries.push({
        source: "UN",
        externalId: tag(block, "DATAID"),
        kind,
        primaryName,
        names: [...new Set([primaryName, ...aliases])],
        birthDates: births,
        nationalities: blocks(block, "NATIONALITY").flatMap((n) => values(n, "VALUE")),
        programs: [tag(block, "UN_LIST_TYPE")].filter(Boolean),
        listedOn: tag(block, "LISTED_ON") || null,
      });
    }
  }
  return { entries, publishedAt };
}

// ---------- OFAC (CSV) ----------

/** OFAC's CSV: no header, double-quoted fields, "-0-" for empty. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); if (row.some((cell) => cell.trim())) rows.push(row); }
  return rows.map((cells) => cells.map((cell) => (cell.trim() === "-0-" ? "" : cell.trim())));
}

export function parseOfacCsv(sdnCsv: string, altCsv: string): { entries: ParsedSanctionsEntry[] } {
  const aliases = new Map<string, string[]>();
  for (const [entNum, , , altName] of parseCsv(altCsv)) {
    if (!entNum || !altName) continue;
    aliases.set(entNum, [...(aliases.get(entNum) ?? []), altName]);
  }
  const entries: ParsedSanctionsEntry[] = [];
  for (const [entNum, name, type, program, , , , , , , , remarks = ""] of parseCsv(sdnCsv)) {
    if (!entNum || !name || !/^\d+$/.test(entNum)) continue;
    const kind = type.toLowerCase() === "individual" ? "individual" : "entity";
    // Vessels and aircraft are not people or companies a merchant could be.
    if (type && kind === "entity" && /vessel|aircraft/i.test(type)) continue;
    entries.push({
      source: "OFAC",
      externalId: entNum,
      kind,
      primaryName: name,
      names: [...new Set([name, ...(aliases.get(entNum) ?? [])])],
      birthDates: [...remarks.matchAll(/DOB ([^;]+)/g)].map((m) => m[1].trim()),
      nationalities: [...remarks.matchAll(/(?:nationality|citizen) ([^;]+)/gi)].map((m) => m[1].trim().replace(/\.$/, "")),
      programs: program ? program.split(/[\]\[;\s]+/).filter(Boolean) : [],
      listedOn: null,
    });
  }
  return { entries };
}

// ---------- Matching ----------

const PARTICLES = new Set(["de", "del", "la", "las", "los", "y", "e", "da", "do", "dos", "das", "di", "van", "von"]);
const COMPANY_WORDS = new Set(["srl", "sa", "ltda", "ltd", "llc", "inc", "co", "corp", "company", "sociedad", "anonima", "limitada", "responsabilidad", "eirl", "sas", "cia", "compania"]);

/** Lower case, no accents or punctuation, without name particles and company suffixes: "José de la Peña S.R.L." → ["jose", "pena"]. */
export function nameTokens(name: string): string[] {
  const plain = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\bs\.\s*r\.\s*l\.?/g, "srl").replace(/\bs\.\s*a\.?(?=\s|$)/g, "sa");
  return plain.split(/[^a-z0-9]+/).filter((token) => token.length >= 2 && !PARTICLES.has(token) && !COMPANY_WORDS.has(token));
}

function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > max) return false;
    previous = current;
  }
  return previous[b.length] <= max;
}

/** Same word, or a spelling one letter off (two for long words): "Mohamed"/"Mohammed", "Gonzalez"/"Gonzales". */
const sameWord = (a: string, b: string) =>
  a === b || (Math.min(a.length, b.length) >= 5 && editDistanceWithin(a, b, Math.min(a.length, b.length) >= 9 ? 2 : 1));

/**
 * How well a screened name matches a listed one, 0–1, and whether it is a possible match: every word of the shorter
 * name appears in the longer (any order, small spelling differences allowed), with at least two words — or the
 * whole name when the listed one is a single word (an organisation like "HAMAS").
 */
export function compareNames(screened: string[], listed: string[]): { score: number; possible: boolean } {
  if (!screened.length || !listed.length) return { score: 0, possible: false };
  const unused = [...listed];
  let matched = 0;
  for (const word of screened) {
    const at = unused.findIndex((candidate) => sameWord(word, candidate));
    if (at >= 0) { matched++; unused.splice(at, 1); }
  }
  const shorter = Math.min(screened.length, listed.length);
  const longer = Math.max(screened.length, listed.length);
  const possible = shorter === 1 ? matched === 1 && longer <= 2 : matched >= 2 && matched >= shorter;
  return { score: Math.round((matched / longer) * 100) / 100, possible };
}

export interface ScreeningEntry {
  id: string;
  source: SanctionsSourceName;
  externalId: string;
  kind: string;
  primaryName: string;
  names: string[];
  birthDates: string[];
  nationalities: string[];
  programs: string[];
}

export interface SanctionsMatch {
  entryId: string;
  /** The list's own id ("UN:6907993"): stays the same when the list is refreshed, unlike entryId. */
  listKey: string;
  /** MANUAL: a name the matcher cannot read (no Latin letters), so a person has to check it. */
  source: SanctionsSourceName | "MANUAL";
  screenedName: string;
  listedName: string;
  primaryName: string;
  score: number;
  birthDates: string[];
  nationalities: string[];
  programs: string[];
}

/** Prepared once per list version: every listed name already split into words. */
export function prepareEntries(entries: ScreeningEntry[]) {
  return entries.map((entry) => ({ entry, names: entry.names.map((name) => ({ name, tokens: nameTokens(name) })).filter((n) => n.tokens.length) }));
}

/** Every possible match for these names, best first, one per listed entry. */
export function screenNames(names: string[], prepared: ReturnType<typeof prepareEntries>): SanctionsMatch[] {
  const found = new Map<string, SanctionsMatch>();
  for (const screenedName of [...new Set(names.map((name) => name.trim()).filter(Boolean))]) {
    const screened = nameTokens(screenedName);
    if (!screened.length) continue;
    for (const { entry, names: listedNames } of prepared) {
      for (const listed of listedNames) {
        const { score, possible } = compareNames(screened, listed.tokens);
        if (!possible) continue;
        const previous = found.get(entry.id);
        if (!previous || previous.score < score) {
          found.set(entry.id, { entryId: entry.id, listKey: `${entry.source}:${entry.externalId}`, source: entry.source, screenedName, listedName: listed.name, primaryName: entry.primaryName, score, birthDates: entry.birthDates, nationalities: entry.nationalities, programs: entry.programs });
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, 25);
}
