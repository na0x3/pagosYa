import type { SourceImageUse } from './source-setup';

const COUNT = String.raw`(?:(?:\d{1,2}|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|two|three|four|five|six|seven|eight|nine|ten)\s+)?`;

/** Only an unambiguous current request overrides inferred reference-only roles. */
export function requestsImageContent(instruction: string) {
  const text = instruction.split('Pedido actual del comercio:').at(-1)!.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(reference|references|referencia|referencias|inspiration|inspiracion|moodboard)\b/.test(text)
    || /\b(?:don't|do not|dont|no|never|without|sin)\s+(?:use|uses|usar|include|incluyas|show|muestres|add|agregues|anadas)\b/.test(text)) return false;
  // A count may sit before the noun: "usa estas 4 fotos", "use these two photos".
  return new RegExp(String.raw`\b(?:use|include|show|display|add|place|put)\s+(?:all\s+(?:of\s+)?)?(?:these|those|my|the|attached|uploaded)\s+${COUNT}(?:uploaded\s+|attached\s+)?(?:photos|pictures|images)\b`).test(text)
    || new RegExp(String.raw`\b(?:crea\w*|haz|genera\w*|build|create|make)\b.{0,60}\b(?:con|with|using)\s+(?:estas?|mis|las|these|my|the|attached)\s+${COUNT}(?:fotos|imagenes|photos|pictures|images)\b`).test(text)
    || new RegExp(String.raw`\b(?:usa|usar|utiliza|incluye|muestra|agrega|anade|pon)\s+(?:todas?\s+)?(?:estas?|esas?|mis|las|los)\s+${COUNT}(?:fotos|imagenes)\b`).test(text);
}

export function honorImageContent(instruction: string, attachedUrls: string[], uses: SourceImageUse[]) {
  if (!requestsImageContent(instruction) || !attachedUrls.length) return uses;
  const current = new Set(attachedUrls.filter(url => /\.(?:png|jpe?g|webp)$/i.test(url)));
  const corrected = uses.map(use => current.has(use.url) && ['reference', 'unknown', 'unused'].includes(use.role)
    ? { ...use, role: 'business' as const, description: 'Imagen aportada para mostrarse en el sitio por indicación del comercio; no asignada a un producto ni usada como logo.' } : use);
  for (const url of current) if (!corrected.some(use => use.url === url)) corrected.push({ url, role: 'business', description: 'Imagen aportada para mostrarse en el sitio por indicación del comercio.' });
  return corrected;
}

/** The repair note for photos the request asked to use that the candidate left out of every page and product. */
export function unusedPhotoDiagnostic(paths: string[], legend: Array<{ original: string; path: string }>, uses: SourceImageUse[]): string {
  const photos = paths.map(path => {
    const original = legend.find(asset => asset.path === path)?.original;
    const use = uses.find(item => item.url === original);
    return `${original ?? path} (${path})${use ? `, ${use.role}: ${use.description.slice(0, 160)}` : ''}`;
  });
  return `El comercio pidió usar estas fotos y no aparecen en ninguna página ni producto: ${photos.join('; ')}. Úsalas como pide el pedido; una foto asignada a un producto va en productOperations[].changes.imageUrls de ese producto, con su URL original.`;
}
