/** Owner 2026-11-15 (DooBoo r10: «meet DooBoo» cut at the top of the hero): a photo that carries words, a logo or packaging text is
 *  shown whole. cropShare is the share of the photo a box hides with object-fit: cover (0 for contain or a matching shape); the page
 *  rule «cropped-words» (source-template-qa-rules) repeats this arithmetic inside the browser. */
export function cropShare(natural: { w: number; h: number }, box: { w: number; h: number }, fit: string): number {
  if (fit !== 'cover' || !natural.w || !natural.h || !box.w || !box.h) return 0;
  const scale = Math.max(box.w / natural.w, box.h / natural.h);
  const shown = (box.w * box.h) / (natural.w * scale * natural.h * scale);
  return Math.round((1 - shown) * 1000) / 1000;
}

/** Each <img> that shows a photo with words gets data-pagosya-words, so the page rule can measure it. */
export function markWordPhotos(content: string, words: ReadonlySet<string>): string {
  if (!words.size) return content;
  // The whole tag is checked, so a mark after src (a fix round's own copy) is never doubled (live 2026-11-16, Oh Belly r24).
  return content.replace(/<img\b[^>]*>/g, tag => {
    const src = tag.match(/\bsrc=(["'])([^"']+)\1/)?.[2];
    return src && words.has(src) && !/\bdata-pagosya-words\b/.test(tag) ? tag.replace(/\bsrc=(["'])([^"']+)\1/, match => `${match} data-pagosya-words`) : tag;
  });
}

export const wordsLookPrompt = 'Mira cada foto, en orden, y di si tiene letras, un logo o texto de un empaque que se lea. Solo sí o no por foto.';
export function wordsLookSchema(count: number): object {
  return { type: 'object', additionalProperties: false, required: ['words'], properties: { words: { type: 'array', minItems: count, maxItems: count, items: { type: 'boolean' } } } };
}
