import { CatalogLayout } from "./catalog-layout";
import { requestsStoreRedesign } from "./store-agent-intent";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
}

// This is a whitelist, not a blocklist: only sentences that actually COMMAND
// a change can rearrange a live store. A blocklist of question/negation
// phrasing is always one phrasing behind (see: "¿me conviene...?", "no
// quiero...", "antes lo tenía..." — none of these are commands, but every one
// of them contains an arrangement word). Failing to recognize a genuine
// request is cheap: the owner falls back to the Studio panel. Acting on a
// request nobody made is not.
const IMPERATIVE = /\b(ponlo|ponla|ponlos|ponlas|pon|coloca|colocalo|colocala|cambia|cambialo|cambiala|organiza|organizalo|organizala|muestra|muestralo|muestrala|quiero|hazlo|hazla|haz que|configura|configuralo|arma|armalo)\b/;

// Second layer: even an imperative-looking sentence can be a question,
// negation or past-tense aside wrapped around the same words ("no quiero que
// esté en secciones", "antes lo tenía en secciones", "¿debería usar...?").
function isQuestionOrHypothetical(text: string): boolean {
  if (text.includes("?") || text.includes("¿")) return true;
  return /\bno\s+(lo\s+|la\s+|los\s+|las\s+)?(quiero|quieras|quisiera|pongas|pusieras|cambies|organices|muestres|dejes)\b/.test(text)
    || /\bantes\s+(lo\s+|la\s+|los\s+|las\s+)?(tenia|teniamos)\b/.test(text)
    || /\b(deberia|deberiamos|convendria|conviene|te conviene|me conviene)\b/.test(text)
    || /\bque te parece\b/.test(text)
    || /\bse ve mejor\b/.test(text)
    || /\bsi (lo |la )?(pongo|pusiera|ponemos)\b/.test(text);
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

  const patterns: [RegExp, CatalogLayout][] = [
    // Requires "productos"/"catalogo" to appear BEFORE "pagina", i.e. as the
    // thing being moved — not merely co-occurring as the page's own name.
    [/\b(productos|catalogo)\b.{0,25}\bpagina\s+(aparte|de productos|separada)\b/, "page"],
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
