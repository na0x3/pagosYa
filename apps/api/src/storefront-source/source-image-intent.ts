import type { SourceImageUse } from './source-setup';

/** Only an unambiguous current request overrides inferred reference-only roles. */
export function requestsImageContent(instruction: string) {
  const text = instruction.split('Pedido actual del comercio:').at(-1)!.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(reference|references|referencia|referencias|inspiration|inspiracion|moodboard)\b/.test(text)
    || /\b(?:don't|do not|dont|no|never|without|sin)\s+(?:use|uses|usar|include|incluyas|show|muestres|add|agregues|anadas)\b/.test(text)) return false;
  return /\b(?:use|include|show|display|add|place|put)\s+(?:all\s+(?:of\s+)?)?(?:these|those|my|the|attached|uploaded)\s+(?:uploaded\s+|attached\s+)?(?:photos|pictures|images)\b/.test(text)
    || /\b(?:crea\w*|haz|genera\w*|build|create|make)\b.{0,60}\b(?:con|with|using)\s+(?:estas?|mis|las|these|my|the|attached)\s+(?:fotos|imagenes|photos|pictures|images)\b/.test(text)
    || /\b(?:usa|usar|utiliza|incluye|muestra|agrega|anade|pon)\s+(?:todas?\s+)?(?:estas?|esas?|mis|las|los)\s+(?:fotos|imagenes)\b/.test(text);
}

export function honorImageContent(instruction: string, attachedUrls: string[], uses: SourceImageUse[]) {
  if (!requestsImageContent(instruction) || !attachedUrls.length) return uses;
  const current = new Set(attachedUrls.filter(url => /\.(?:png|jpe?g|webp)$/i.test(url)));
  const corrected = uses.map(use => current.has(use.url) && ['reference', 'unknown', 'unused'].includes(use.role)
    ? { ...use, role: 'business' as const, description: 'Imagen aportada para mostrarse en el sitio por indicación del comercio; no asignada a un producto ni usada como logo.' } : use);
  for (const url of current) if (!corrected.some(use => use.url === url)) corrected.push({ url, role: 'business', description: 'Imagen aportada para mostrarse en el sitio por indicación del comercio.' });
  return corrected;
}
