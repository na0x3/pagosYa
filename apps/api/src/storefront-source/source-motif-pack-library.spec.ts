import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';
import { listMotifPacks, MOTIF_PACK_PLACEMENTS, validateMotifPackDir } from './source-motif-packs';

const TOOL = join(__dirname, '../../../../packages/storefront-kit/tools/motif-packs.mjs');
/** The drawn library, in drawing order; each batch task adds its packs here first. */
const LIBRARY = ['paws', 'coffee', 'bread', 'fruit', 'cups', 'chili', 'cake', 'icecream', 'gifts', 'balloons', 'hearts', 'sparkles', 'hangers', 'shoes', 'scissors', 'drops', 'gems', 'yarn', 'leaves', 'flowers', 'lamps', 'brushes', 'books', 'sun', 'circuits', 'games', 'music', 'tools', 'waves', 'stars'];

describe('the drawn motif pack library', () => {
  it('ships exactly the drawn packs', () => {
    expect(readdirSync(kitPath('motif-packs')).filter(name => !name.startsWith('.')).sort()).toEqual([...LIBRARY].sort());
  });

  it('passes validation pack by pack: sanitiser byte for byte, 6 KB, currentColor, placements, labelled parts', () => {
    for (const id of LIBRARY) expect({ id, problems: validateMotifPackDir(kitPath('motif-packs', id), id).problems }).toEqual({ id, problems: [] });
  });

  it('fills all eight placements with five drawings per pack', () => {
    for (const pack of listMotifPacks()) {
      expect(pack.motifs.map(motif => motif.placement).sort()).toEqual([...MOTIF_PACK_PLACEMENTS].sort());
      expect(new Set(pack.motifs.map(motif => motif.file)).size).toBe(5);
    }
  });

  it('is exactly what the drawing tool draws from the hand-drawn glyphs', () => {
    expect(() => execFileSync(process.execPath, [TOOL, '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('gives every pack its own topic words: no word names two packs', () => {
    const owner = new Map<string, string>();
    for (const pack of listMotifPacks()) for (const word of [...pack.topics.es, ...pack.topics.en]) {
      expect({ word, pack: owner.get(word) ?? pack.id }).toEqual({ word, pack: pack.id });
      owner.set(word, pack.id);
    }
  });

  it('covers the owner\'s topics: at least 30 packs, every topic the spec names drawn', () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(30);
    const named = ['paws', 'coffee', 'leaves', 'flowers', 'bread', 'fruit', 'drops', 'sparkles', 'lamps', 'shoes', 'hangers', 'scissors', 'brushes', 'gems', 'games', 'circuits', 'books', 'music', 'balloons', 'waves', 'sun', 'stars', 'hearts', 'cups', 'chili'];
    for (const id of named) expect(LIBRARY).toContain(id);
  });
});
