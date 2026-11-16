import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchSector, planLibraryTopUp, readPhotoLibrary, type LibrarySector } from './v2-photo-library';

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
