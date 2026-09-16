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

/** Matches arrangement-shaped, imperative PHRASES only. "crea una seccion de
 * historia" is rejected because "crea" is not an arrangement verb; "pon una
 * foto en la pagina de productos" is rejected because the thing being placed
 * is a photo, not the product catalog itself. */
export function catalogArrangementIntent(instruction: string): { layout: CatalogLayout } | null {
  // A genuine full-site brief still needs to reach the compositor, even when
  // it also mentions an arrangement word (e.g. "rediseña mi tienda... y
  // ponla en secciones").
  if (requestsStoreRedesign(instruction)) return null;

  const text = normalize(instruction);
  if (isQuestionOrHypothetical(text)) return null;
  if (!IMPERATIVE.test(text)) return null;

  // The "page" arrangement is checked in both natural word orders: the
  // object before "pagina" ("pon los productos en una pagina aparte") and
  // after it ("quiero una pagina aparte para los productos"). Either way,
  // what disambiguates it from an edit request that merely names the
  // products page as a destination ("pon una foto en la pagina de
  // productos") is that "productos"/"catalogo" must appear together with an
  // explicit "aparte"/"separada"/"de productos" marker, not just anywhere
  // in the sentence.
  const pageObjectBeforePagina = /\b(productos|catalogo)\b.{0,25}\bpagina\s+(aparte|de productos|separada)\b/;
  const pageObjectAfterPagina = /\bpagina\s+(aparte|separada)\b.{0,25}\b(productos|catalogo)\b/;
  if (pageObjectBeforePagina.test(text) || pageObjectAfterPagina.test(text)) return { layout: "page" };

  const patterns: [RegExp, CatalogLayout][] = [
    [/\b(en|por) seccion(es)?\b/, "sections"],
    [/\b(una )?pestanas?\b.{0,12}(por )?coleccion(es)?\b/, "tabs"],
    [/\ben pestanas\b/, "tabs"],
    [/\btodo en (la )?portada\b/, "all"],
  ];

  for (const [pattern, layout] of patterns) {
    if (pattern.test(text)) return { layout };
  }
  return null;
}
