import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { apiRoot } from './v2-sandbox';

/** Spec 2026-11-16 store quality, Part 1 (owner «Curated library»): hand-picked CC0 photos per kind of business, so a store with few
 *  photos of its own still gets a page full of pictures. One folder per sector with its photos and a manifest.json. */
export type LibraryPhoto = { file: string; subject: string; shape: 'wide' | 'tall' | 'square'; source: string; license: 'CC0' };
export type LibrarySector = { sector: string; label: string; keywords: string[]; photos: LibraryPhoto[]; dir: string };

export const photoLibraryDir = () => join(apiRoot(), 'assets', 'photo-library');

export async function readPhotoLibrary(dir = photoLibraryDir()): Promise<LibrarySector[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const sectors: LibrarySector[] = [];
  for (const entry of entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const raw = await readFile(join(dir, entry.name, 'manifest.json'), 'utf8').catch(() => null);
    if (!raw) continue;
    const manifest = JSON.parse(raw) as Omit<LibrarySector, 'dir'>;
    sectors.push({ ...manifest, dir: join(dir, entry.name) });
  }
  return sectors;
}

const plain = (text: string) => ` ${text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** The sector the store's own words name most — at least two keywords, never a tie (a wrong sector is worse than none). */
export function matchSector(words: string, sectors: readonly LibrarySector[]): LibrarySector | null {
  const text = plain(words);
  const scored = sectors.map(sector => ({ sector, hits: sector.keywords.filter(keyword => text.includes(plain(keyword))).length }))
    .filter(entry => entry.hits >= 2).sort((a, b) => b.hits - a.hits);
  if (!scored.length || (scored[1] && scored[1].hits === scored[0].hits)) return null;
  return scored[0].sector;
}

/** How many library photos a store gets: none with 12 usable photos of its own or after its one top-up; otherwise enough to reach
 *  14, at least 6. */
export function planLibraryTopUp(input: { usable: number; already: boolean }): number {
  if (input.already || input.usable >= 12) return 0;
  return Math.max(6, 14 - input.usable);
}
