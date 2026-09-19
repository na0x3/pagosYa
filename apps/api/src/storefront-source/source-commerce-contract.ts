import { isNextSource, nextSourceFile, nextPageMarkup, validateNextSources } from './source-next';
import { BadRequestException } from '@nestjs/common';
import type { SourceProjectSnapshot } from './source-project';

/** Structural publishing gate. The isolated browser checker verifies actual behavior. */
export function assertSourceCommerceContract(snapshot: SourceProjectSnapshot) {
  const files = new Map(snapshot.files.map(file => [file.path, file.content]));
  let config: any;
  try {
    const match = files.get('config.js')?.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
    config = match && JSON.parse(match[1]);
    if (!config || typeof config !== 'object') throw new Error();
  } catch { throw new BadRequestException('Corrige config.js antes de publicar.'); }
  if (!files.has('commerce.js')) throw new BadRequestException('El sitio necesita el componente compartido commerce.js.');
  const clean = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, tag => tag.replace(/>[\s\S]*<\//, '></'));
  const next = isNextSource(snapshot.files);
  if (next) validateNextSources(snapshot.files.filter(f => nextSourceFile(f.path)));
  const home = clean(next ? nextPageMarkup(snapshot.files, 'home') : files.get('index.html') || '');
  if (!/<[^>]+\bdata-pagosya-catalog(?:\s|=|>)/i.test(home)) throw new BadRequestException('La página inicial necesita el catálogo compartido.');
  if (!/<(?:button|a)\b[^>]*(?:\bdata-cart-open(?:\s|=|>)|href\s*=\s*["']#(?:pedido|carrito|cart)["'])/i.test(home)) throw new BadRequestException('Añade un botón Pedido con data-cart-open para abrir el carrito.');
  for (const [path, source] of files) {
    if (!path.endsWith('.html')) continue;
    const html = clean(source);
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(match => {
      try { return new URL(match[1], `https://source.invalid/${path}`).href; } catch { return ''; }
    });
    if (!['config.js', 'commerce.js'].every(name => scripts.includes(`https://source.invalid/${name}`))) throw new BadRequestException(`${path} debe cargar config.js y commerce.js compartidos.`);
  }
  for (const key of ['productPage', 'checkoutPage']) {
    if (config[key] && (typeof config[key] !== 'string' || !files.has(config[key]))) throw new BadRequestException(`La página configurada en ${key} no existe.`);
  }
}
