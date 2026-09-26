'use strict';
// Plantillas: each template is a complete React store (components/**/*.tsx + styles/globals.css, the format YAPI
// produces) plus template.json and demo photos. The API applies one as a store revision; the Studio lists them.
const { readdirSync, readFileSync, statSync, existsSync } = require('node:fs');
const { join, extname } = require('node:path');

const TEMPLATE_CATEGORIES = Object.freeze(['comida', 'moda', 'belleza', 'hogar', 'arte', 'tecnologia', 'mascotas', 'ninos', 'deporte', 'servicios', 'producto-unico']);
const PHOTO_ROLES = Object.freeze(['hero', 'product', 'lifestyle', 'detail']);
const DEMO_MAX_BYTES = 600 * 1024;
const ID = /^[a-z0-9-]{2,40}$/;
const SLOT = /^[a-z0-9-]{1,30}$/;
const DEMO_FILE = /^[a-z0-9-]+\.(jpg|png|webp)$/;
const templatesDir = join(__dirname, 'templates');

function fail(id, field, detail) { throw new TypeError(`Plantilla ${id}: ${field} ${detail}`); }

function validate(dir, id) {
  const manifest = JSON.parse(readFileSync(join(dir, 'template.json'), 'utf8'));
  if (manifest.id !== id) fail(id, 'id', `must equal its folder name`);
  if (typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.name.length > 40) fail(id, 'name', 'must be 1-40 characters');
  if (!TEMPLATE_CATEGORIES.includes(manifest.category)) fail(id, 'category', `must be one of ${TEMPLATE_CATEGORIES.join(', ')}`);
  if (typeof manifest.description !== 'string' || !manifest.description.trim() || manifest.description.length > 160) fail(id, 'description', 'must be 1-160 characters');
  if (!Array.isArray(manifest.tags) || manifest.tags.some(tag => typeof tag !== 'string')) fail(id, 'tags', 'must be a list of words');
  if (manifest.sitePurpose !== 'shop') fail(id, 'sitePurpose', 'must be shop');
  if (!Number.isInteger(manifest.order)) fail(id, 'order', 'must be an integer');
  if (manifest.dna !== undefined && (!manifest.dna || typeof manifest.dna !== 'object' || Array.isArray(manifest.dna) || Object.entries(manifest.dna).some(([key, value]) => !/^[a-z]+$/.test(key) || typeof value !== 'string'))) fail(id, 'dna', 'must map kit surface names to values');
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
  return Object.freeze({ ...manifest, ...(manifest.dna ? { dna: Object.freeze({ ...manifest.dna }) } : {}), tags: Object.freeze([...manifest.tags]), photos: Object.freeze(manifest.photos.map(photo => Object.freeze({ ...photo }))) });
}

/** Reads and validates every template under `root`. Throws on the first invalid manifest (a build error, never input). */
function loadTemplates(root = templatesDir) {
  return readdirSync(root).filter(name => ID.test(name) && statSync(join(root, name)).isDirectory() && existsSync(join(root, name, 'template.json')))
    .map(name => ({ dir: join(root, name), manifest: validate(join(root, name), name) }))
    .sort((a, b) => a.manifest.order - b.manifest.order || a.manifest.id.localeCompare(b.manifest.id));
}

let cache;
const registry = () => (cache ??= new Map(loadTemplates().map(entry => [entry.manifest.id, entry])));

const listTemplates = () => [...registry().values()].map(entry => entry.manifest);
const templateManifest = id => (typeof id === 'string' && ID.test(id) ? registry().get(id)?.manifest : undefined);

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
  return entry ? readTemplateSource(entry.dir) : [];
}

function templateDemoPhoto(id, slot) {
  const entry = templateManifest(id) && registry().get(id);
  const photo = entry?.manifest.photos.find(p => p.slot === slot);
  if (!photo?.demo) return undefined;
  return { ext: extname(photo.demo).slice(1), bytes: readFileSync(join(entry.dir, 'demo', photo.demo)) };
}

module.exports = { TEMPLATE_CATEGORIES, PHOTO_ROLES, DEMO_MAX_BYTES, templatesDir, loadTemplates, readTemplateSource, listTemplates, templateManifest, templateSourceFiles, templateDemoPhoto };
