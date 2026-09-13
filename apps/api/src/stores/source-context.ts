import { sourceAssetInventory } from './source-asset-library';
import { savedSourceDesign } from './source-design';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { sourceMotionMode } from './source-motion';

export function sourceSiteContext(files: SourceProjectFileDto[] = []) {
  const design = savedSourceDesign(files);
  return {
    ...(design ? { design: design.concepts[design.selected] } : {}),
    pages: files.filter(f => f.path.endsWith('.html')).map(f => ({ path: f.path, title: f.content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.slice(0, 200) || '', headings: [...f.content.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)].slice(0, 16).map(m => m[1].replace(/<[^>]*>/g, '').slice(0, 200)) })),
    bundledAssets: files.filter(f => f.path.startsWith('assets/')).map(f => ({ path: f.path, references: files.filter(page => page.path.endsWith('.html') && page.content.includes(f.path)).map(page => page.path) })),
    visualAssets: sourceAssetInventory(files),
    motion: sourceMotionMode(files),
  };
}

/** Only the current request can authorize replacing source during a broad redesign. */
export function sourceRedesignRequested(instruction: string) {
  const task = instruction.split('Pedido actual del comercio:').at(-1)!.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (/\b(?:no|sin|don't|do not|without)\s+(?:quiero\s+(?:que\s+)?)?(?:redisen|redesign|rebuild|cambi)/.test(task)) return false;
  if (/\b(?:don't|do not|never)\s+(?:make|give)\b|\bno\s+(?:lo\s+)?(?:hagas|haz|hacer|quiero|quieras).{0,80}(?:diferent|distint|nuev)/.test(task)) return false;
  const referenceRequest = task.replace(/https?:\/\/\S+/g, '');
  if (!/\b(?:no|don't|do not|without|sin)\b/.test(referenceRequest)
    && !/\b(?:header|footer|button|logo|nav|typography|encabezado|pie|boton|tipografia)\b/.test(referenceRequest)
    && /\b(?:my|the|mi|el|la|nuestro|nuestra)\s+(?:website|site|storefront|sitio|tienda|web|pagina)\s+(?:(?:to|se)\s+)?(?:look\s+like|like|similar\s+to|como|igual\s+(?:a|que)|vea\s+como|parezca\s+a)\b/.test(referenceRequest)) return true;
  return /(?:give)\s+(?:my|the)\s+(?:site|store|website)\s+a\s+(?:new|fresh)\s+(?:visual\s+)?(?:direction|identity)/.test(task)
    || /(?:make|give)\s+(?:it|the (?:whole )?(?:site|website))\s+(?:(?:look|feel|be)\s+)?(?:a\s+)?(?:completely|totally|entirely)\s+(?:different|new)|(?:hazlo|que se vea)\s+(?:completamente|totalmente)\s+(?:distinto|diferente|nuevo)|(?:new|fresh)\s+(?:visual\s+)?(?:direction|identity)\s+(?:for|across)\s+(?:the|my)\s+(?:site|store)/.test(task)
    || /(?:redisen|redesign|rebuild)\w*\s+(?:(?:todo|toda|todos|todas|all|the|my|mi|el|la|un|una|este|entero|entera|completo|completa|entire|whole|full)\s+)*(?:sitio|website|site|tienda|storefront|pagina|page|diseno|design|todo|everything)\b|(?:genera\w*|haz|crea\w*|disena\w*)\s+(?:lo\s+)?de\s+nuevo/.test(task)
    || /cambia.*colores/.test(task) && /secciones/.test(task)
    || /change.*colors/.test(task) && /sections/.test(task);
}

/** Narrow only explicit page-file requests. Ambiguous or global work keeps full context. */
export function sourceTaskContext(files: SourceProjectFileDto[], instruction: string) {
  if (/\b(all|every|global|sitewide|site-wide|todas|todos|completo|entero)\b/i.test(instruction)) return { files, omitted: [] as string[] };
  const mentioned = new Set((instruction.match(/(?:pages\/)?[a-zA-Z0-9_-]+\.html\b/g) || []).filter(path => files.some(file => file.path === path)));
  if (!mentioned.size) return { files, omitted: [] as string[] };
  const selected = files.filter(file => !file.path.endsWith('.html') || mentioned.has(file.path));
  return { files: selected, omitted: files.filter(file => !selected.includes(file)).map(file => file.path) };
}
