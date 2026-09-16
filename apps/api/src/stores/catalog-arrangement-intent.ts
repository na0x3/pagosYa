import { CatalogLayout } from "./catalog-layout";
import { requestsStoreRedesign } from "./store-agent-intent";

// Mirrors requestsStoreRedesign's own normalization, including stripping
// quoted spans: a phrase inside quotation marks is being referred to (e.g.
// asking what it means), never requested.
function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es")
    .replace(/["“«][^"”»]*["”»]/g, " ").replace(/\s+/g, " ").trim();
}

// This is a whitelist, not a blocklist: only sentences that actually COMMAND
// a change can rearrange a live store. A blocklist of question/negation
// phrasing is always one phrasing behind (see: "¿me conviene...?", "no
// quiero...", "antes lo tenía..." — none of these are commands, but every one
// of them contains an arrangement word). Failing to recognize a genuine
// request is cheap: the owner falls back to the Studio panel. Acting on a
// request nobody made is not.
//
// Each stem is matched with an OPTIONAL enclitic pronoun suffix (-me, -te,
// -lo, -la, -los, -las, -le, -les, -nos, -se) so real Spanish command forms
// — "muéstrame", "ponme", "póngalo", "colócame" — are recognized without
// hand-listing every conjugation.
const ENCLITIC = "(?:me|te|lo|la|los|las|le|les|nos|se)?";
const IMPERATIVE_STEMS = [
  "ponga", "pon", "coloque", "coloca", "cambie", "cambia",
  "organice", "organiza", "muestre", "muestra", "haga", "haz",
  "configure", "configura", "arme", "arma",
];
const IMPERATIVE = new RegExp(`\\b(?:${IMPERATIVE_STEMS.join("|")})${ENCLITIC}\\b|\\b(?:quiero|necesito)\\b`);

// Second layer: even an imperative-looking sentence can be a question,
// negation, past-tense aside, or a request to explain a term rather than
// apply it — wrapped around the same words ("no quiero que esté en
// secciones", "antes lo tenía en secciones", "me gusta cómo está en
// secciones pero...", "quiero entender qué significa...").
function isQuestionOrHypothetical(text: string): boolean {
  if (text.includes("?") || text.includes("¿")) return true;
  return /\bno\s+(lo\s+|la\s+|los\s+|las\s+)?(quiero|quieras|quisiera|necesito|pongas|pusieras|cambies|organices|muestres|dejes)\b/.test(text)
    || /\bantes\s+(lo\s+|la\s+|los\s+|las\s+)?(tenia|teniamos)\b/.test(text)
    || /\b(deberia|deberiamos|convendria|conviene|te conviene|me conviene)\b/.test(text)
    || /\bque te parece\b/.test(text)
    || /\bse ve mejor\b/.test(text)
    || /\bsi (lo |la )?(pongo|pusiera|ponemos)\b/.test(text)
    // Praising or describing the CURRENT layout is not a request to change it.
    || /\b(me gusta )?(como|asi) esta\b/.test(text)
    // Asking what a term means is not a request to apply it.
    || /\b(entender|significa|que es)\b/.test(text);
}

// Third layer, and the one invariant every layout pattern must pass: the
// thing being arranged has to be the CATALOG — not a photo, a banner, a
// sales report, a to-do list, or an existing page being named rather than
// requested. Every misfire found across three review rounds shares this one
// shape: a layout phrase attached to something that isn't the store's
// products. So instead of hand-patching each phrasing, this is a single
// shared check every candidate match runs through: if one of these nouns
// sits between the request verb and the matched layout phrase, the layout
// phrase is scenery, not the request, and the match is discarded.
const NON_CATALOG_OBJECT = /\b(fotos?|videos?|banners?|imag(?:en|enes)|textos?|logos?|boton(?:es)?|reportes?|listas?|ideas?|precios?|tareas?|ventas?)\b/;

// The text strictly between two (non-overlapping) regex matches, regardless
// of which one comes first in the string.
function textBetween(text: string, a: RegExpExecArray, b: RegExpExecArray): string {
  const aEnd = a.index + a[0].length;
  if (aEnd <= b.index) return text.slice(aEnd, b.index);
  const bEnd = b.index + b[0].length;
  if (bEnd <= a.index) return text.slice(bEnd, a.index);
  return ""; // overlapping matches: nothing meaningfully "between" them
}

/** Matches arrangement-shaped, imperative PHRASES only, and only when the
 * catalog is what's actually being asked about. "crea una seccion de
 * historia" is rejected because "crea" is not an arrangement verb; "pon una
 * foto en la pagina aparte de productos" is rejected because "foto" — not
 * the catalog — sits between the verb and the layout phrase, so the phrase
 * is naming an existing page, not requesting one. */
export function catalogArrangementIntent(instruction: string): { layout: CatalogLayout } | null {
  // A genuine full-site brief still needs to reach the compositor, even when
  // it also mentions an arrangement word (e.g. "rediseña mi tienda... y
  // ponla en secciones").
  if (requestsStoreRedesign(instruction)) return null;

  const text = normalize(instruction);
  if (isQuestionOrHypothetical(text)) return null;

  const verbMatch = IMPERATIVE.exec(text);
  if (!verbMatch) return null;

  // The "page" arrangement is checked in both natural word orders: the
  // object before "pagina" ("pon los productos en una pagina aparte") and
  // after it ("quiero una pagina aparte para los productos"). Both still
  // have to clear the shared catalog-object gate below, which is what
  // rejects "pon una foto en la pagina aparte de productos" — the object
  // sitting between the verb and "pagina aparte" is a photo, not the
  // catalog, so the page is being named, not requested.
  const candidates: [RegExp, CatalogLayout][] = [
    [/\b(productos|catalogo)\b.{0,25}\bpagina\s+(aparte|de productos|separada)\b/, "page"],
    [/\bpagina\s+(aparte|separada)\b.{0,25}\b(productos|catalogo)\b/, "page"],
    [/\b(en|por) seccion(es)?\b/, "sections"],
    [/\b(una )?pestanas?\b.{0,12}(por )?coleccion(es)?\b/, "tabs"],
    [/\ben pestanas\b/, "tabs"],
    [/\btodo en (la )?portada\b/, "all"],
  ];

  for (const [pattern, layout] of candidates) {
    const phraseMatch = pattern.exec(text);
    if (!phraseMatch) continue;
    if (NON_CATALOG_OBJECT.test(textBetween(text, verbMatch, phraseMatch))) continue;
    return { layout };
  }
  return null;
}
