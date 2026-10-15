import sharp from 'sharp';
import { captureAgentDraft } from './agent/agent-capture';
import { merchantAsksForPhotoGroup, sourceMediaPolicy } from './source-media-design';
import { sourceAssetInventory } from './source-asset-library';
import type { SourceCompositionPlan } from './source-composition-plan';
import { agentProjectIndex } from './agent/agent-task';

jest.setTimeout(120_000);
const policy = sourceMediaPolicy('shop', true, 'Crea una tienda limpia')!;
const fixture = async (content: string) => ({ brief: {}, files: [
  { path: 'index.html', content: `<html><head><meta charset="utf-8"><style>body{margin:0}img{display:block}</style></head><body><main>${content}</main></body></html>` },
  { path: 'assets/portrait.png', encoding: 'base64', content: (await sharp({ create: { width: 736, height: 1104, channels: 3, background: '#dba8ab' } }).png().toBuffer()).toString('base64') },
] }) as any;
const photo = (style: string, alt = 'Producto') => `<img src="assets/portrait.png" alt="${alt}" style="${style}">`;
const check = async (html: string, selected = policy) => (await captureAgentDraft(await fixture(html), 1280, undefined, 'index.html', [], 'normal', selected)).errors;

it('exposes real pixel dimensions to planning and project inspection without a model call', async () => {
  const { files } = await fixture('');
  expect(sourceAssetInventory(files)[0].pixels).toEqual({ width: 736, height: 1104 });
  expect(agentProjectIndex(files).assets[0].pixels).toEqual({ width: 736, height: 1104 });
});
it('rejects the actual portrait-to-wide-banner failure and accepts a bounded portrait composition', async () => {
  const errors = await check(photo('width:1200px;height:476px;object-fit:cover'));
  expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('Foto ampliada'), expect.stringContaining('Recorte excesivo')]));
  expect(await check(photo('width:340px;height:510px;object-fit:contain'))).toEqual([]);
});
it('rejects repeated photo-only content without hiding real catalog inventory', async () => {
  expect(await check(Array.from({ length: 4 }, (_, i) => `<section>${photo('width:200px;height:300px', `Editorial ${i}`)}</section>`).join(''))).toEqual(expect.arrayContaining([expect.stringContaining('[composition:photo-only-sequence]')]));
  expect(await check('<a href="#catalog">Comprar productos</a>' + photo('width:340px;height:510px') + `<div id="catalog" data-pagosya-catalog>${Array.from({ length: 12 }, () => photo('width:200px;height:300px')).join('')}</div>`)).toEqual([]);
});
it('lets an authored collage stand by default, and respects an explicit refusal', async () => {
  const html = `<section style="position:relative;height:450px">${photo('position:absolute;width:200px;height:300px;left:0;top:0')}${photo('position:absolute;width:200px;height:300px;left:100px;top:80px')}</section>`;
  // Layering is a design decision the merchant hired Yapi to make; only an explicit "sin collage" withdraws it.
  expect(await check(html)).toEqual([]);
  expect(await check(html, sourceMediaPolicy('shop', true, 'Quiero un collage')!)).toEqual([]);
  expect(await check(html, sourceMediaPolicy('shop', true, 'Sin collage')!)).toEqual(expect.arrayContaining([expect.stringContaining('superpuestas')]));
});
it('scopes the default to whole-store shopping designs and respects explicit homepage galleries', () => {
  expect(sourceMediaPolicy('portfolio', true, '')).toBeUndefined();
  expect(sourceMediaPolicy('shop', false, 'Cambia el título')).toBeUndefined();
  expect(sourceMediaPolicy('shop', true, 'Usa todas las fotos')).not.toHaveProperty('maxEditorialImages');
  expect(sourceMediaPolicy('shop', true, 'Pon una galería en el inicio')).not.toHaveProperty('maxEditorialImages');
  expect(sourceMediaPolicy('shop', true, 'Sin galería en inicio, sin collage')).toEqual({ ...policy, allowLayered: false });
});

it('requires a visible shopping entry instead of a screen filled only by decoration', async () => {
  expect(await check('<div style="height:950px">Marca</div><a href="#catalog">Comprar</a><div id="catalog" data-pagosya-catalog></div>')).toEqual(expect.arrayContaining([expect.stringContaining('Inicio sin una acción de compra')]));
  expect(await check('<header><a href="#catalog">Comprar</a></header><div style="height:950px">Marca</div><div id="catalog" data-pagosya-catalog></div>')).toEqual([]);
});

const gallery = `<style>@media(max-width:600px){#looks{grid-template-columns:200px!important}}</style><h1>Galería</h1><section id="looks" style="display:grid;grid-template-columns:repeat(3,200px);gap:20px">${Array.from({ length: 5 }, (_, i) => photo('width:200px;height:300px;object-fit:contain', `Look ${i}`)).join('')}</section>`;
it('rejects an unplanned 3+2 image wall on a separate gallery page', async () => {
  const snapshot = await fixture(gallery);
  snapshot.files[0].path = 'galeria.html';
  for (const width of [1280, 390] as const) {
    const result = await captureAgentDraft(snapshot, width, undefined, 'galeria.html', [], 'normal', policy);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('[composition:photo-group]')]));
  }
});
it.each(['coleccion.html', 'colecciones.html'])('allows useful category links to %s without a photograph quota', async route => {
  expect(await check(`<section style="display:grid;grid-template-columns:repeat(3,200px)">${Array.from({length:6},(_,i)=>`<a href="${route}?category=${i}">${photo('width:200px;height:300px')}<span>Categoría ${i}</span></a>`).join('')}</section>`)).toEqual([]);
});
it('does not treat a headline or arbitrary external image links as grid purpose', async () => {
  expect(await check(gallery.replace(/(<img[^>]*>)/g, '<a href="https://example.com">$1<span>Read more</span></a>'))).toEqual(expect.arrayContaining([expect.stringContaining('[composition:photo-group]')]));
});
it('includes bounded raster background panels in composition checks', async () => {
  expect(await check(`<section style="display:grid;grid-template-columns:repeat(3,200px)">${Array.from({length:5},()=>'<div style="width:200px;height:300px;background-image:url(assets/portrait.png)"></div>').join('')}</section>`)).toEqual(expect.arrayContaining([expect.stringContaining('[composition:photo-group]')]));
});

it('accepts the same 3+2 layout when its lookbook purpose and media are planned', async () => {
  const plan: SourceCompositionPlan = { family:'editorial-lookbook', rationale:'Outfit photography helps customers compare the seasonal collection.', pages:[{ page:'galeria.html', purpose:'lookbook', rationale:'A seasonal collection presented as styled looks.', sections:[{ id:'looks', intent:'Show complete outfits from the seasonal collection.', layout:'editorial-gallery', geometry:'grid', media:[{asset:'assets/portrait.png',role:'detail'}], mobile:'grid', primaryAction:'Browse the collection' }] }] };
  const snapshot = await fixture(gallery);
  snapshot.files[0].path = 'galeria.html';
  expect((await captureAgentDraft(snapshot, 1280, undefined, 'galeria.html', [], 'normal', sourceMediaPolicy('shop',true,'Create a seasonal lookbook',plan))).errors).toEqual([]);
  const stale = structuredClone(plan); stale.pages[0].sections[0].media[0].asset = 'assets/other.png';
  expect((await captureAgentDraft(snapshot,1280,undefined,'galeria.html',[],'normal',sourceMediaPolicy('shop',true,'Create a seasonal lookbook',stale))).errors).toEqual(expect.arrayContaining([expect.stringContaining('[composition:unjustified-image-wall]')]));
});
it('does not let one introductory sentence justify unrelated image walls', async () => {
  expect(await check(gallery.replace('<section id="looks"', '<p>Explore our wonderful collection and find something for you.</p><section id="looks"'))).toEqual(expect.arrayContaining([expect.stringContaining('[composition:photo-group]')]));
});
it('allows explained cards and dominant-image compositions only when the merchant asks for a gallery', async () => {
  const cards = `<section style="display:flex">${Array.from({length:4},(_,i)=>`<figure>${photo('width:150px;height:225px')}<figcaption>Option ${i}: the confirmed dimensions are 10 by 20 centimetres.</figcaption></figure>`).join('')}</section>`;
  const dominant = `<section style="display:flex">${photo('width:340px;height:510px')}${photo('width:100px;height:150px')}${photo('width:100px;height:150px')}</section>`;
  const asked = sourceMediaPolicy('shop', true, 'Quiero una galería de fotos del local')!;
  for (const html of [cards, dominant]) {
    expect(await check(html)).toEqual(expect.arrayContaining([expect.stringContaining('[composition:photo-group]')]));
    expect(await check(html, asked)).toEqual([]);
  }
});
it('rejects the Raíz Viva store-ambience collage even when the plan calls it an editorial gallery', async () => {
  // 2026-10-15 owner report: one large, one tall and two small store photos, planned as editorial-gallery, plus an excuse caption.
  const html = `<section id="ambiente"><h2>Estantes, madera y verdes</h2><p>El espacio acompaña una forma directa de elegir.</p><div style="display:grid;grid-template-columns:600px 400px 280px;gap:20px">${photo('width:600px;height:760px;object-fit:contain','Estanterías')}${photo('width:400px;height:600px;object-fit:contain','Exhibidor')}<div>${photo('width:250px;height:375px;object-fit:contain','Detalle')}${photo('width:250px;height:375px;object-fit:contain','Mostrador')}</div></div><p>Las fotografías muestran ambiente de tienda.</p></section>`;
  const plan = { family: 'craft-story', rationale: 'r', pages: [{ page: 'index.html', purpose: 'story', rationale: 'r', sections: [{ id: 'ambiente', intent: 'Mostrar las fotografías confirmadas como contexto de tienda', layout: 'editorial-gallery', geometry: 'rail', mobile: 'rail', primaryAction: 'WhatsApp', media: [{ asset: 'assets/portrait.png', role: 'lead' }] }] }] } as SourceCompositionPlan;
  expect(await check(html, sourceMediaPolicy('shop', true, 'Crea mi tienda de suplementos', plan)!)).toEqual(expect.arrayContaining([expect.stringContaining('[composition:photo-group]')]));
});
it('counts photos per section, so one photo in each of several text sections is not a group', async () => {
  expect(await check(`<div>${Array.from({ length: 3 }, (_, i) => `<section>${photo('width:200px;height:300px', `Foto ${i}`)}<p>Un párrafo real sobre esta parte de la tienda número ${i}.</p></section>`).join('')}</div>`)).toEqual([]);
  expect(await check(`<section style="display:flex">${photo('width:200px;height:300px')}${photo('width:200px;height:300px')}</section>`)).toEqual([]);
});
it('reads a gallery request only from the merchant, never from a refusal', () => {
  expect(merchantAsksForPhotoGroup('Pon una galería en el inicio')).toBe(true);
  expect(merchantAsksForPhotoGroup('quiero un COLLAGE de fotos')).toBe(true);
  expect(merchantAsksForPhotoGroup('Resumen: galería de arte.\nPedido actual del comercio: haz mejor la página de contacto')).toBe(false);
  expect(merchantAsksForPhotoGroup('Sin galería en inicio, sin collage')).toBe(false);
  expect(merchantAsksForPhotoGroup('no quiero ningún mosaico de fotos')).toBe(false);
  expect(merchantAsksForPhotoGroup('Crea una tienda limpia')).toBe(false);
});
