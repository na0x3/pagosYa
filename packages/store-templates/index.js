'use strict';
// Plantillas: each template is a complete React store (components/**/*.tsx + styles/globals.css, the format YAPI
// produces) plus template.json and demo photos. The API applies one as a store revision; the Studio lists them.
const { readdirSync, readFileSync, statSync, existsSync } = require('node:fs');
const { join, extname } = require('node:path');

const TEMPLATE_CATEGORIES = Object.freeze(['comida', 'moda', 'belleza', 'hogar', 'arte', 'tecnologia', 'mascotas', 'ninos', 'deporte', 'servicios', 'libros', 'producto-unico', 'motor', 'construccion', 'general']);
const PHOTO_ROLES = Object.freeze(['hero', 'product', 'lifestyle', 'detail']);
const DEMO_MAX_BYTES = 600 * 1024;
const ID = /^[a-z0-9-]{2,40}$/;
const SLOT = /^[a-z0-9-]{1,30}$/;
const DEMO_FILE = /^[a-z0-9-]+\.(jpg|png|webp)$/;
const templatesDir = join(__dirname, 'templates');

const COPY_ROLES = ['headline', 'title', 'lead', 'body', 'cta', 'label', 'item', 'question', 'answer', 'quote', 'name', 'alt'];
function fail(id, field, detail) { throw new TypeError(`Plantilla ${id}: ${field} ${detail}`); }

const HEX = /^#[0-9a-f]{6}$/i;
const MASTER_COPY_KEYS = ['announcement', 'eyebrow', 'headline', 'subcopy', 'primaryCta', 'secondaryCta', 'productsTitle', 'storyTitle', 'storyBody', 'closingLine', 'closingCta', 'tagline'];
/** Spec 2026-10-19 master template: default copy, eight palettes and eight font pairs a store is filled from. */
function validateMaster(id, master) {
  if (!master || typeof master !== 'object') fail(id, 'master', 'must be an object');
  const copy = master.copy || {};
  for (const key of MASTER_COPY_KEYS) if (typeof copy[key] !== 'string') fail(id, `master.copy.${key}`, 'must be text');
  if (!Array.isArray(copy.values) || copy.values.length !== 3 || copy.values.some(v => !v || typeof v.title !== 'string' || typeof v.text !== 'string')) fail(id, 'master.copy.values', 'must be three { title, text }');
  if (!Array.isArray(master.palettes) || master.palettes.length < 8) fail(id, 'master.palettes', 'must list at least eight palettes');
  for (const p of master.palettes) {
    if (!p || !SLOT.test(p.id) || typeof p.name !== 'string') fail(id, 'master.palettes', 'need an id and a name');
    for (const key of ['paper', 'ink', 'muted', 'accent', 'deep']) if (!HEX.test(p[key])) fail(id, `master palette ${p.id}`, `${key} must be #rrggbb`);
  }
  if (!Array.isArray(master.fonts) || master.fonts.length < 8) fail(id, 'master.fonts', 'must list at least eight font pairs');
  for (const f of master.fonts) if (!f || !SLOT.test(f.id) || typeof f.name !== 'string' || !SLOT.test(f.heading) || !SLOT.test(f.body)) fail(id, 'master.fonts', 'need id, name, heading and body font ids');
  if (master.variants !== undefined) {
    if (!master.variants || typeof master.variants !== 'object') fail(id, 'master.variants', 'must map parts to variant ids');
    for (const [part, ids] of Object.entries(master.variants)) if (!Array.isArray(ids) || !ids.length || ids.some(v => !SLOT.test(v))) fail(id, `master.variants.${part}`, 'must list variant ids');
  }
  if (master.sections !== undefined && (!Array.isArray(master.sections) || master.sections.some(v => !SLOT.test(v)))) fail(id, 'master.sections', 'must list section ids');
}

function validate(dir, id) {
  const manifest = JSON.parse(readFileSync(join(dir, 'template.json'), 'utf8'));
  if (manifest.id !== id) fail(id, 'id', `must equal its folder name`);
  if (typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.name.length > 40) fail(id, 'name', 'must be 1-40 characters');
  if (!TEMPLATE_CATEGORIES.includes(manifest.category)) fail(id, 'category', `must be one of ${TEMPLATE_CATEGORIES.join(', ')}`);
  if (typeof manifest.description !== 'string' || !manifest.description.trim() || manifest.description.length > 160) fail(id, 'description', 'must be 1-160 characters');
  if (!Array.isArray(manifest.tags) || manifest.tags.some(tag => typeof tag !== 'string')) fail(id, 'tags', 'must be a list of words');
  if (manifest.sitePurpose !== 'shop') fail(id, 'sitePurpose', 'must be shop');
  if (!Number.isInteger(manifest.order)) fail(id, 'order', 'must be an integer');
  if (manifest.hidden !== undefined && typeof manifest.hidden !== 'boolean') fail(id, 'hidden', 'must be true or false');
  if (manifest.dna !== undefined && (!manifest.dna || typeof manifest.dna !== 'object' || Array.isArray(manifest.dna) || Object.entries(manifest.dna).some(([key, value]) => !/^[a-z]+$/.test(key) || typeof value !== 'string'))) fail(id, 'dna', 'must map kit surface names to values');
  if (manifest.master !== undefined) validateMaster(id, manifest.master);
  // Spec 2026-10-20 Plantillas fill: the flat text slots a converted template reads from store-data `copy`.
  if (manifest.copy !== undefined) {
    if (!Array.isArray(manifest.copy) || manifest.copy.some(slot => !slot || !/^(?:home|shell|product)_\d+$/.test(slot.key) || !COPY_ROLES.includes(slot.role) || typeof slot.default !== 'string' || !Number.isInteger(slot.max) || slot.max < 1)) fail(id, 'copy', 'must be a list of { key, role, default, max } slots');
    if (new Set(manifest.copy.map(slot => slot.key)).size !== manifest.copy.length) fail(id, 'copy', 'has a repeated key');
  }
  // Plantillas presets (2026-10-22): a look of the master template — its palette, fonts, parts, sections and starting words —
  // with its own demo photos and no source of its own. Checked against the master once every template is loaded.
  if (manifest.extends !== undefined || manifest.preset !== undefined) {
    if (!ID.test(String(manifest.extends)) || !manifest.preset || typeof manifest.preset !== 'object' || Array.isArray(manifest.preset)) fail(id, 'preset', 'needs extends (a master template id) and a preset object');
    if (manifest.master || manifest.copy) fail(id, 'preset', 'cannot also be a master or a converted template');
    const preset = manifest.preset;
    if (!SLOT.test(String(preset.palette)) || !SLOT.test(String(preset.fonts))) fail(id, 'preset', 'needs a palette and a font pair id');
    if (preset.colors !== undefined && (typeof preset.colors !== 'object' || Object.values(preset.colors).some(value => !HEX.test(value)))) fail(id, 'preset.colors', 'must be #rrggbb values');
    if (!preset.variants || typeof preset.variants !== 'object' || Object.values(preset.variants).some(value => typeof value !== 'string')) fail(id, 'preset.variants', 'must map parts to variant ids');
    if (preset.copy !== undefined && (typeof preset.copy !== 'object' || Object.entries(preset.copy).some(([key, value]) => key === 'values' ? !Array.isArray(value) : !MASTER_COPY_KEYS.includes(key) || typeof value !== 'string'))) fail(id, 'preset.copy', 'must hold master copy keys');
    if (preset.sections !== undefined && (!Array.isArray(preset.sections) || preset.sections.some(section => !section || !SLOT.test(section.id) || typeof section.title !== 'string' || !Array.isArray(section.items)))) fail(id, 'preset.sections', 'must be sections with id, title and items');
  }
  // Starters (spec 2026-10-24): a finished store a new store can start from; fits = the business words it suits.
  if (manifest.starter !== undefined) {
    const s = manifest.starter;
    if (!s || typeof s !== 'object' || typeof s.description !== 'string' || !s.description.trim() || s.description.length > 160) fail(id, 'starter.description', 'must be 1-160 characters');
    if (!Array.isArray(s.fits) || s.fits.length < 3 || s.fits.some(word => typeof word !== 'string' || word !== word.toLowerCase() || !word.trim())) fail(id, 'starter.fits', 'must list at least three lowercase words');
    if (s.fashion !== undefined && typeof s.fashion !== 'boolean') fail(id, 'starter.fashion', 'must be true or false');
    if (!Number.isInteger(s.order)) fail(id, 'starter.order', 'must be an integer');
    if (s.dice !== undefined) {
      if (!manifest.extends) fail(id, 'starter.dice', 'only a starter that extends a master can roll dice');
      if (!s.dice || typeof s.dice !== 'object' || Array.isArray(s.dice)) fail(id, 'starter.dice', 'must be an object of id lists');
      for (const [part, ids] of Object.entries(s.dice)) {
        const looks = part === 'palettes' || part === 'fonts';
        const ok = Array.isArray(ids) && ids.every(value => typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value)) && new Set(ids).size === ids.length;
        const size = ok && (looks ? ids.length >= 1 && ids.length <= 6 : ids.length >= 2 && ids.length <= 4);
        if (!size) fail(id, `starter.dice.${part}`, looks ? 'must list 1-6 distinct ids' : 'must list 2-4 distinct ids');
      }
    }
  }
  if (manifest.curated !== undefined && (typeof manifest.curated !== 'boolean' || (manifest.curated && !manifest.copy && !manifest.preset))) fail(id, 'curated', 'must be true or false, and only on a converted template (with copy) or a preset');
  if (!Array.isArray(manifest.photos)) fail(id, 'photos', 'must be a list');
  const slots = new Set();
  for (const photo of manifest.photos) {
    if (!photo || !SLOT.test(photo.slot) || slots.has(photo.slot)) fail(id, 'photos', `has an invalid or repeated slot ${photo && photo.slot}`);
    slots.add(photo.slot);
    if (!PHOTO_ROLES.includes(photo.role)) fail(id, `photo ${photo.slot} role`, `must be one of ${PHOTO_ROLES.join(', ')}`);
    if (photo.demo !== undefined) {
      if (!DEMO_FILE.test(photo.demo)) fail(id, `photo ${photo.slot} demo`, 'must be a .jpg, .png or .webp file name');
      const path = join(dir, 'demo', photo.demo);
      if (!existsSync(path)) fail(id, `demo ${photo.demo}`, 'is missing');
      if (statSync(path).size > DEMO_MAX_BYTES) fail(id, `demo ${photo.demo}`, 'is larger than 600 KB');
    }
  }
  return Object.freeze({ ...manifest, ...(manifest.dna ? { dna: Object.freeze({ ...manifest.dna }) } : {}), ...(manifest.master ? { master: Object.freeze(manifest.master) } : {}), ...(manifest.copy ? { copy: Object.freeze(manifest.copy.map(slot => Object.freeze({ ...slot }))) } : {}), ...(manifest.starter ? { starter: Object.freeze({ ...manifest.starter, fits: Object.freeze([...manifest.starter.fits]), ...(manifest.starter.dice ? { dice: Object.freeze(Object.fromEntries(Object.entries(manifest.starter.dice).map(([part, ids]) => [part, Object.freeze([...ids])]))) } : {}) }) } : {}), tags: Object.freeze([...manifest.tags]), photos: Object.freeze(manifest.photos.map(photo => Object.freeze({ ...photo }))) });
}

/** Reads and validates every template under `root`. Throws on the first invalid manifest (a build error, never input). */
function loadTemplates(root = templatesDir) {
  const entries = readdirSync(root).filter(name => ID.test(name) && statSync(join(root, name)).isDirectory() && existsSync(join(root, name, 'template.json')))
    .map(name => ({ dir: join(root, name), manifest: validate(join(root, name), name) }))
    .sort((a, b) => a.manifest.order - b.manifest.order || a.manifest.id.localeCompare(b.manifest.id));
  for (const { manifest } of entries) if (manifest.preset) validatePreset(manifest, entries.find(entry => entry.manifest.id === manifest.extends)?.manifest);
  return entries;
}

/** A preset only names what its master offers: a palette, a font pair, one variant per part and catalogued sections. */
function validatePreset(manifest, base) {
  const { id, preset } = manifest;
  if (!base || !base.master) fail(id, 'extends', `must name a master template, not ${manifest.extends}`);
  const settings = base.master;
  if (!settings.palettes.some(palette => palette.id === preset.palette)) fail(id, 'preset.palette', `is not a palette of ${base.id}`);
  if (!settings.fonts.some(font => font.id === preset.fonts)) fail(id, 'preset.fonts', `is not a font pair of ${base.id}`);
  for (const [part, value] of Object.entries(preset.variants)) {
    const ids = (settings.variants || {})[part];
    if (!ids) fail(id, `preset.variants.${part}`, `is not a part of ${base.id}`);
    for (const one of part === 'feature' ? value.split(',').filter(Boolean) : [value]) if (!ids.includes(one)) fail(id, `preset.variants.${part}`, `${one} is not offered`);
  }
  for (const section of preset.sections || []) if (!(settings.sections || []).includes(section.id) && section.id !== 'blog') fail(id, 'preset.sections', `${section.id} is not a section of ${base.id}`);
}

let cache;
const registry = () => (cache ??= new Map(loadTemplates().map(entry => [entry.manifest.id, entry])));

const listTemplates = () => [...registry().values()].map(entry => entry.manifest);
const templateManifest = id => (typeof id === 'string' && ID.test(id) ? registry().get(id)?.manifest : undefined);

/** What merchants may pick from: every template except the ones the owner hid. Hidden ones still resolve by id. */
// Starters (spec 2026-10-24) are offered by YAPI's pick and «Probar otro estilo», never as Plantillas.
const gallerySelection = manifests => manifests.filter(manifest => manifest.hidden !== true && !(manifest.starter && !manifest.preset));
const galleryTemplates = () => gallerySelection(listTemplates());
/** Starters (spec 2026-10-24): the finished stores a new store may start from, Esencial included, in their own order. */
const listStarters = () => listTemplates().filter(manifest => manifest.starter && manifest.hidden !== true).sort((a, b) => a.starter.order - b.starter.order);

function walk(dir, prefix) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, `${prefix}${name}/`) : [`${prefix}${name}`];
  });
}

/** The template's authored source: components/**\/*.tsx and styles/globals.css, nothing else. */
function readTemplateSource(dir) {
  const components = walk(join(dir, 'components'), 'components/').filter(path => path.endsWith('.tsx'));
  const styles = existsSync(join(dir, 'styles', 'globals.css')) ? ['styles/globals.css'] : [];
  return [...components, ...styles].sort().map(path => ({ path, content: readFileSync(join(dir, path), 'utf8') }));
}

function templateSourceFiles(id) {
  const entry = templateManifest(id) && registry().get(id);
  // A preset has no source of its own: it is its master's. A starter that extends a master has its own (spec 2026-10-24).
  if (entry && entry.manifest.extends && !existsSync(join(entry.dir, 'components'))) return templateSourceFiles(entry.manifest.extends);
  return entry ? readTemplateSource(entry.dir) : [];
}

function templateDemoPhoto(id, slot) {
  const entry = templateManifest(id) && registry().get(id);
  const photo = entry?.manifest.photos.find(p => p.slot === slot);
  if (!photo?.demo) return undefined;
  return { ext: extname(photo.demo).slice(1), bytes: readFileSync(join(entry.dir, 'demo', photo.demo)) };
}

module.exports = { TEMPLATE_CATEGORIES, PHOTO_ROLES, DEMO_MAX_BYTES, templatesDir, loadTemplates, readTemplateSource, listTemplates, templateManifest, gallerySelection, galleryTemplates, listStarters, templateSourceFiles, templateDemoPhoto };
