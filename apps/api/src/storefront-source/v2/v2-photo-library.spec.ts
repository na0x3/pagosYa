import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { matchSector, planLibraryTopUp, readPhotoLibrary, type LibrarySector } from './v2-photo-library';
import { SourceV2PrototypeService } from './v2-prototype.service';

const sector = (id: string, keywords: string[]): LibrarySector => ({ sector: id, label: id, keywords, photos: [], dir: `/x/${id}` });
const bakery = sector('panaderia', ['panaderia', 'pan', 'cookies', 'galletas', 'rolls', 'pasteleria', 'horno']);
const cafe = sector('cafe', ['cafe', 'espresso', 'latte', 'barista', 'tostado']);
const bridal = sector('novias', ['novia', 'novias', 'alta costura', 'vestido de novia', 'atelier']);

describe('v2 photo library (spec 2026-11-16 store quality, Part 1)', () => {
  it('matches the bakery from the store\'s own words, accents and case aside', () => {
    expect(matchSector('Panadería de autor: rolls rellenos, cookies gourmet y cajas', [bakery, cafe, bridal])?.sector).toBe('panaderia');
    expect(matchSector('Atelier de ALTA COSTURA: vestidos de novia', [bakery, cafe, bridal])?.sector).toBe('novias');
  });
  it('needs two keywords, so one stray word never picks a sector', () => {
    expect(matchSector('Licuadoras portátiles; una con café', [bakery, cafe, bridal])).toBeNull();
  });
  it('a tie between two sectors picks none', () => {
    expect(matchSector('pan y latte, galletas y espresso', [bakery, cafe])).toBeNull();
  });
  it('tops up only stores under 12 usable photos, at least 6, never twice', () => {
    expect(planLibraryTopUp({ usable: 8, already: false })).toBe(6);
    expect(planLibraryTopUp({ usable: 0, already: false })).toBe(14);
    expect(planLibraryTopUp({ usable: 5, already: false })).toBe(9);
    expect(planLibraryTopUp({ usable: 12, already: false })).toBe(0);
    expect(planLibraryTopUp({ usable: 2, already: true })).toBe(0);
  });
  it('reads every sector manifest and skips a folder without one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lib-'));
    await mkdir(join(dir, 'panaderia')); await mkdir(join(dir, 'vacio'));
    await writeFile(join(dir, 'panaderia', 'manifest.json'), JSON.stringify({ sector: 'panaderia', label: 'Panadería', keywords: ['pan'], photos: [{ file: 'a.jpg', subject: 'manos amasando', shape: 'wide', source: 'https://example.org/a', license: 'CC0' }] }));
    const read = await readPhotoLibrary(dir);
    expect(read.map(s => s.sector)).toEqual(['panaderia']);
    expect(read[0].dir).toBe(join(dir, 'panaderia'));
  });
});

describe('v2 build: library top-up', () => {
  const jpeg = (w: number) => sharp({ create: { width: w, height: Math.round(w * .66), channels: 3, background: '#cc9966' } }).jpeg().toBuffer();
  const library = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lib-'));
    await mkdir(join(dir, 'panaderia'));
    const photos = [];
    for (let i = 0; i < 10; i++) { await writeFile(join(dir, 'panaderia', `p${i}.jpg`), await jpeg(1200)); photos.push({ file: `p${i}.jpg`, subject: `foto ${i}`, shape: 'wide', source: 'https://example.org', license: 'CC0' }); }
    await writeFile(join(dir, 'panaderia', 'manifest.json'), JSON.stringify({ sector: 'panaderia', label: 'Panadería', keywords: ['panaderia', 'cookies', 'rolls'], photos }));
    return dir;
  };
  const service = async (uploadsCount: number, onboarding: Record<string, unknown> = {}) => {
    const own = await jpeg(900);
    const created: unknown[] = [], updates: unknown[] = []; let saved = 0;
    const prisma = {
      store: { findUnique: async () => ({ onboarding: { what: 'Panadería de autor: rolls y cookies', ...onboarding } }), update: async (args: unknown) => { updates.push(args); return {}; } },
      mediaAsset: { findMany: async () => Array.from({ length: uploadsCount }, (_, i) => ({ url: `/v1/uploads/own-${i}.jpg` })), create: async (args: unknown) => { created.push(args); return {}; } },
    };
    const uploads = { getBuffer: async () => own, saveBuffer: async (_b: Buffer, mimeType: string) => ({ url: `/v1/uploads/new-${++saved}.jpg`, filename: `new-${saved}.jpg`, mimeType, byteSize: 10 }) };
    const svc = Object.assign(Object.create(SourceV2PrototypeService.prototype), { prisma, uploads });
    return { svc, created, updates };
  };
  const files = [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"storeName":"Miga","categories":[{"id":"c1","name":"Galletas"}],"items":[{"id":"p1","name":"Galletas chocochip"}]}};' }];

  it('adds library photos to a store with 8 of its own and marks the store', async () => {
    const dir = await library(); const { svc, created, updates } = await service(8);
    expect(await svc.topUpLibraryPhotos('m1', 's1', files, dir)).toEqual({ added: 6, sector: 'panaderia' });
    expect(created).toHaveLength(6);
    expect(JSON.stringify(updates[0])).toMatch(/libraryPhotos/);
  });
  it('adds nothing after the store\'s one top-up, nor to a store with 12 photos', async () => {
    const dir = await library();
    expect((await (await service(3, { libraryPhotos: { sector: 'panaderia', count: 11 } })).svc.topUpLibraryPhotos('m1', 's1', files, dir)).added).toBe(0);
    expect((await (await service(12)).svc.topUpLibraryPhotos('m1', 's1', files, dir)).added).toBe(0);
  });
});
