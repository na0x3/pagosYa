import { imageDimensions } from '../source-photo-facts';
import { storefrontPageIndex, STOREFRONT_CAPABILITIES_VERSION } from '@pagosya/shared-types';
import { createHash } from 'node:crypto';
import type { SourceProjectFileDto } from '../dto/save-source-project.dto';

export type ValidationProfile = 'normal' | 'reduced-motion';
export type AgentRequirement = { id:string; description:string; page:string; check:'text'|'absent_text'|'image'|'element'|'style'|'navigation'|'video'|'video-paused'|'layout'; profile?: ValidationProfile; selector:string; expected:string };
export type RequirementEvidence = { id:string; passed:boolean; detail:string; page:string; width:number; profile?: ValidationProfile; kind?: 'requirement' | 'checker-error'; expected?: string; observed?: string };
/** A grouped image requirement means ALL listed assets, never one comma-containing filename. */
export function agentImagePaths(expected: string): string[] {
  const paths = expected.split(/[,\n]/).map(path => path.trim().replace(/^\//, ''));
  if (!paths.length || paths.length > 24 || paths.some(path => !/^assets\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|avif|gif|svg)$/i.test(path) || path.split('/').includes('..'))) {
    throw new Error('image necesita rutas locales de imágenes, separadas por comas si son varias; se comprobarán TODAS.');
  }
  return [...new Set(paths)];
}
export function validateTaskRequirements(value: unknown, files: SourceProjectFileDto[]): AgentRequirement[] {
  if(!Array.isArray(value)||!value.length||value.length>12)throw new Error('Planifica entre 1 y 12 requisitos verificables que cubran cada parte del pedido.');
  const pages=new Set(storefrontPageIndex(files).map(page=>page.url));
  if(!pages.size) ['index.html','product.html','checkout.html'].forEach(page=>pages.add(page));
  const ids=new Set<string>();
  return value.map(r=>{
    if(!r||!/^r[1-9][0-9]?$/.test(r.id)||ids.has(r.id)||(!pages.has(r.page) && !/^[a-z][a-z0-9-]{0,47}\.html$/.test(r.page))||!['text','absent_text','image','element','style','navigation','video','video-paused','layout'].includes(r.check)||typeof r.description!=='string'||!r.description.trim()||r.description.length>300||typeof r.selector!=='string'||r.selector.length>300||typeof r.expected!=='string'||!r.expected.trim()||r.expected.length>500)throw new Error('Requisito inválido: usa ID único r1/r2, página registrada, descripción y una comprobación concreta.');
    if (/@|[{}]/.test(r.selector)) throw new Error('selector debe ser un selector CSS, sin reglas @media ni bloques. Las comprobaciones se ejecutan en escritorio y móvil; usa profile para reduced-motion y layout:no-overflow para adaptación.');
    if (r.check === 'navigation' && !/^[a-z][a-z0-9-]{0,47}\.html$/.test(r.expected)) throw new Error('La comprobación navigation necesita una página local como servicios.html, sin anclas ni parámetros. Para secciones de la misma página comprueba su contenido visible con text/element.');
    if (r.profile != null && !['normal', 'reduced-motion'].includes(r.profile)) throw new Error('Perfil inválido: normal o reduced-motion.');
    if (['video','video-paused'].includes(r.check) && !/^\/?assets\/[a-zA-Z0-9_-]+\.mp4$/.test(r.expected)) throw new Error('video necesita la ruta local assets/video.mp4.');
    if (r.check === 'layout' && !['viewport-cover', 'no-overflow'].includes(r.expected)) throw new Error('layout necesita viewport-cover o no-overflow.');
    if (r.check === 'image') agentImagePaths(r.expected);
    if (r.check === 'element' && !/^[1-9][0-9]{0,3}$/.test(r.expected)) throw new Error('element necesita un número entero positivo de elementos visibles.');
    if (r.check === 'style' && !/^[-a-zA-Z]+\s*:\s*\S/.test(r.expected)) throw new Error('style necesita propiedad:valor-computado, por ejemplo color:rgb(0, 0, 0).');
    ids.add(r.id);return {id:r.id,description:r.description,page:r.page,check:r.check,selector:r.selector,expected:r.expected,...(r.profile ? {profile:r.profile} : {})};
  });
}
export function workspaceDigest(files: SourceProjectFileDto[]): string { return createHash('sha256').update(JSON.stringify(files.map(f=>[f.path,f.content]))).digest('hex').slice(0,16); }
export function agentProjectIndex(files: SourceProjectFileDto[]) {
  let itemCount = 0;
  try { const raw = files.find(f => f.path === 'config.js')?.content.replace(/^\s*window\.PAGOSYA_CONFIG\s*=\s*/, '').replace(/;\s*$/, ''); const data = raw ? JSON.parse(raw) : {}; itemCount = Array.isArray(data.data?.items) ? data.data.items.length : 0; } catch {}
  return {catalog:{itemCount,state:itemCount ? 'real products available' : 'empty: verify layout and empty states only; no purchasable product exists; do not invent a product or claim a purchase was tested'},version:STOREFRONT_CAPABILITIES_VERSION,pages:storefrontPageIndex(files),assets:files.filter(f=>/^assets\//.test(f.path)&&/\.(png|jpe?g|webp|avif|svg|gif|mp4)$/i.test(f.path)).map(f=>({id:createHash('sha256').update(f.path).digest('hex').slice(0,12),path:f.path,...(f.encoding==='base64'?{pixels:imageDimensions(Buffer.from(f.content,'base64'))}:{}),available:!!f.content,bytes:Buffer.byteLength(f.content,f.encoding==='base64'?'base64':'utf8')})),editable:files.filter(f=>/^components\/.*\.tsx$|^styles\/globals\.css$/.test(f.path)&&f.path!=='components/store-data.tsx').map(f=>f.path),protected:['components/store-data.tsx','config.js','commerce.js','_compiled/*'],settings:'Business policies and contact data come from confirmed store settings. Never invent them. If no supported operation exists, report blocked with the exact field needed.'};
}

/** Reject checks that the protected commerce runtime cannot satisfy in this catalog state, before editing starts. */
export function assertTaskFeasibility(requirements: AgentRequirement[], baseFiles: SourceProjectFileDto[]) {
  let items: unknown;
  try { items = JSON.parse(baseFiles.find(file => file.path === 'config.js')?.content.replace(/^\s*window\.PAGOSYA_CONFIG\s*=\s*/, '').replace(/;\s*$/, '') || '{}').data?.items; } catch { return; }
  if (!Array.isArray(items) || items.length) return;
  const impossible = requirements.find(r => r.page === 'product.html' && /data-pagosya-product|data-part\s*=|data-product-(?:gallery|title|price|add)/.test(r.selector));
  if (impossible) throw new Error(`Comprobación inviable ${impossible.id}: el catálogo está vacío. La ficha y galería de un producto real no se montan sin producto. Conserva todos los requisitos del comercio y comprueba el estado vacío de product.html; no inventes productos ni hagas depender la entrega de una ficha inexistente.`);
}

/** Require explicit coverage for unambiguous full-screen media requests before the agent edits. */
export function assertMerchantTaskCoverage(requirements: AgentRequirement[], instruction: string): void {
  const text = instruction.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const cover = /(?:pantalla completa|toda la altura de la pantalla|full[- ]screen|portada completa|full[- ]viewport)/.test(text);
  if (!cover || !/\bvideo\b/.test(text)) return;
  const normalVideo = requirements.find(r => r.check === 'video' && (r.profile || 'normal') === 'normal');
  const geometry = requirements.find(r => r.check === 'layout' && r.expected === 'viewport-cover' && r.page === normalVideo?.page);
  const fallback = requirements.find(r => r.check === 'image' && r.profile === 'reduced-motion' && r.page === normalVideo?.page);
  const paused = requirements.find(r => r.check === 'video-paused' && r.profile === 'reduced-motion' && r.expected === normalVideo?.expected && r.page === normalVideo?.page);
  if (!normalVideo || !geometry || !fallback || !paused) throw new Error('El pedido de video a pantalla completa requiere video decodificado en normal, layout:viewport-cover del contenedor de portada, image de respaldo en reduced-motion y video-paused con la misma ruta en reduced-motion. No basta con comprobar que existe un elemento.');
}
