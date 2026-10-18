/** «Copia esta estructura», «hazme la web como esta», «igual a esta», «clona esta página» (spec 2026-10-18 website copy, decision 1).
 *  Inspiration wording («inspírate en», «algo parecido», «estilo de») stays today's reference unless a copy word is there too. */
const STRONG = /(?<!\p{L})(cop(?:i[aáeé]\p{L}*|y)|clon(?:a|ar|ame|á|e|ando)|igual (?:a|que)|id[eé]ntic[oa]s?|misma (?:estructura|p[aá]gina|web|dise[nñ]o)|exactamente como)(?!\p{L})/iu;
const PLAIN = /(?<!\p{L})((?:haz(?:me)?|quiero|arma(?:me)?|crea(?:me)?|dise[nñ]a(?:me)?) (?:la|mi|una|el) (?:web|p[aá]gina|tienda|sitio)(?: \p{L}+)? (?:como|igual)|como (?:esta|este|esa|ese) (?:p[aá]gina|web|tienda|sitio)|like this (?:site|page|one))(?!\p{L})/iu;
const INSPIRE = /(?<!\p{L})(insp[ií]r\w*|parecid[oa]|algo como|estilo de|referencia)(?!\p{L})/iu;

export function websiteCopyAsked(words: string): boolean {
  if (STRONG.test(words)) return true;
  return PLAIN.test(words) && !INSPIRE.test(words);
}
