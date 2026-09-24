/** A full-site brief must reach the compositor before individual words such as
 * "tabs", "text" or "animations" can classify it as a small editor command. */
export function requestsStoreRedesign(instruction: string): boolean {
  const text = instruction.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/["“«][^"”»]*["”»]/g, " ").replace(/\s+/g, " ").trim();
  const site = "(?:website|web|sitio(?: web)?|pagina web|tienda|storefront|site)";
  // The verb must address the site itself, not a header, photo or tab in it.
  const modifiers = "(?:(?:el|la|mi|nuestro|nuestra|un|una|todo|toda|the|my|our|a|entire|whole|complete|new|nuevo|nueva)\\s+){0,5}";
  const object = `${modifiers}${site}\\b`;
  const remake = "(?:rehaz|rehacer|reconstruye|reconstruir|redisena|redisenar|rebuild|redesign|remake)";
  // Explicitly preserving the site must never trigger regeneration.
  if (new RegExp(`\\b(?:no|sin|evita|never|do not|don't)\\b.{0,30}\\b${remake}\\b.{0,32}\\b${site}\\b`).test(text)) return false;
  if (new RegExp(`\\b${remake}\\s+${object}`).test(text)) return true;
  const create = "(?:haz|hacer|hagas|crea|crear|genera|generar|arma|armar|make|create|build|generate)";
  const scope = "(?:de nuevo|desde cero|complet[oa]|enter[oa]|from scratch|again|entire|whole)";
  if (new RegExp(`\\b(?:no|sin|evita|never|do not|don't)\\b.{0,30}\\b${create}\\b.{0,40}\\b${site}\\b`).test(text)) return false;
  return new RegExp(`\\b${create}\\s+${object}\\s+(?:(?:otra vez|otra ves)\\b|${scope}\\b)`).test(text)
    || new RegExp(`\\b${create}\\s+${modifiers}(?:nuev[oa]|new|another|entire|whole)\\s+${object}`).test(text)
    || new RegExp(`\\b(?:cambio profundo|rediseno completo|nueva version)\\s+(?:de|del|en|para)\\s+${object}`).test(text);
}
