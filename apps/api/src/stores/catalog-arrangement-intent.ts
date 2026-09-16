import { CatalogLayout } from "./catalog-layout";
import { requestsStoreRedesign } from "./store-agent-intent";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
}

/** Matches arrangement-shaped PHRASES, never a bare noun: "crea una seccion de
 * historia" contains "seccion" but asks to add a page section, not to lay out
 * the catalog, so it must return null. Each pattern requires the preposition
 * that turns the word into a request about the catalog's arrangement. */
export function catalogArrangementIntent(instruction: string): { layout: CatalogLayout } | null {
  const text = normalize(instruction);
  // A genuine full-site brief still needs to reach the compositor.
  if (requestsStoreRedesign(instruction)) return null;

  const patterns: [RegExp, CatalogLayout][] = [
    [/\b(en|por) seccion(es)?\b/, "sections"],
    [/\b(una )?pestanas?\b.{0,12}(por )?coleccion(es)?\b/, "tabs"],
    [/\ben pestanas\b/, "tabs"],
    [/\bpagina (aparte|de productos|separada)\b/, "page"],
    [/\btodo en (la )?portada\b/, "all"],
  ];

  for (const [pattern, layout] of patterns) {
    if (pattern.test(text)) return { layout };
  }
  return null;
}
