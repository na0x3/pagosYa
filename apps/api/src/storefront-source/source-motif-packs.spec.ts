import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chosenMotifPack, drawingProblems, listMotifPacks, loadMotifPack, snapshotWithMotifPack, MOTIF_PACK_PLACEMENTS, sanitizeRuntimeMotifPack, validateMotifPackDir } from './source-motif-packs';
import { withSanitizedMotifs } from './source-motifs';
import { FIXTURE_DRAWINGS, fixturePack } from './fixtures/motif-pack';

const MANIFEST = {
  id: 'huellas', version: 1, name: 'Huellas', topics: { es: ['perro', 'mascota', 'huella'], en: ['dog', 'pet', 'paw'] },
  motifs: [{ placement: 'button', file: 'button.svg', behavior: 'bounce' }, { placement: 'empty', file: 'empty.svg', behavior: 'steam' }, { placement: 'card', file: 'button.svg', behavior: 'bounce' }],
};
const GOOD = { 'button.svg': FIXTURE_DRAWINGS.button, 'empty.svg': FIXTURE_DRAWINGS.empty };
function packDir(files: Record<string, string> = GOOD, manifest: object = MANIFEST, folder = 'huellas') {
  const root = mkdtempSync(join(tmpdir(), 'motif-packs-'));
  mkdirSync(join(root, folder));
  writeFileSync(join(root, folder, 'pack.json'), JSON.stringify(manifest));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, folder, name), content);
  return { root, dir: join(root, folder) };
}
const HOSTILE: Record<string, string> = {
  'a script': FIXTURE_DRAWINGS.button.replace('</svg>', '<script>alert(1)</script></svg>'),
  'a foreignObject': FIXTURE_DRAWINGS.button.replace('</svg>', '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>'),
  'an external image href': FIXTURE_DRAWINGS.button.replace('</svg>', '<image href="https://evil.test/x.png" width="4" height="4"/></svg>'),
  'a javascript link': FIXTURE_DRAWINGS.button.replace('<circle cx="12" cy="15" r="4"/>', '<a href="javascript:alert(1)"><circle cx="12" cy="15" r="4"/></a>'),
  'an event handler': FIXTURE_DRAWINGS.button.replace('<circle cx="12"', '<circle onload="alert(1)" cx="12"'),
  'a style attribute': FIXTURE_DRAWINGS.button.replace('<circle cx="12"', '<circle style="fill:url(https://evil.test/a)" cx="12"'),
  'an external url() fill': FIXTURE_DRAWINGS.button.replace('fill="none"', 'fill="url(https://evil.test/a)"'),
  'a hard-coded colour': FIXTURE_DRAWINGS.button.replace('stroke="currentColor"', 'stroke="#ff0000"'),
  'an id that could shadow a page id': FIXTURE_DRAWINGS.button.replace('<circle cx="12" cy="15"', '<circle id="pagosya-product-title" cx="12" cy="15"'),
};

describe('motif pack validation', () => {
  it('accepts the fixture drawings exactly as written', () => {
    for (const [name, content] of Object.entries(FIXTURE_DRAWINGS)) expect({ name, problems: drawingProblems(name, content) }).toEqual({ name, problems: [] });
  });

  it('accepts a clean pack and loads it as config.js markup, one entry per placement', () => {
    const { root, dir } = packDir();
    expect(validateMotifPackDir(dir, 'huellas').problems).toEqual([]);
    expect(listMotifPacks(root).map(pack => pack.id)).toEqual(['huellas']);
    expect(loadMotifPack('huellas', root)).toEqual({ id: 'huellas', motifs: [
      { placement: 'button', behavior: 'bounce', svg: FIXTURE_DRAWINGS.button },
      { placement: 'empty', behavior: 'steam', svg: FIXTURE_DRAWINGS.empty },
      { placement: 'card', behavior: 'bounce', svg: FIXTURE_DRAWINGS.button },
    ] });
    expect(loadMotifPack('otro', root)).toBeUndefined();
    expect(loadMotifPack('../huellas', root)).toBeUndefined();
  });

  it.each(Object.keys(HOSTILE))('rejects a drawing with %s, and never loads the pack', name => {
    expect(drawingProblems('button.svg', HOSTILE[name]).length).toBeGreaterThan(0);
    const { root, dir } = packDir({ ...GOOD, 'button.svg': HOSTILE[name] });
    expect(validateMotifPackDir(dir, 'huellas').problems.length).toBeGreaterThan(0);
    expect(loadMotifPack('huellas', root)).toBeUndefined();
    expect(listMotifPacks(root)).toEqual([]);
  });

  it('rejects a drawing over 6 KB', () => {
    const heavy = FIXTURE_DRAWINGS.button.replace('</svg>', `${'<circle cx="1" cy="1" r="1"/>'.repeat(260)}</svg>`);
    expect(drawingProblems('button.svg', heavy)).toEqual(expect.arrayContaining([expect.stringContaining('6 KB')]));
  });

  it('names every manifest mistake', () => {
    const problems = (manifest: object, files: Record<string, string> = GOOD, folder = 'huellas') => { const { dir } = packDir(files, manifest, folder); return validateMotifPackDir(dir, folder).problems.join('\n'); };
    expect(problems(MANIFEST, GOOD, 'otra')).toMatch(/id must equal the folder/);
    expect(problems({ ...MANIFEST, motifs: [...MANIFEST.motifs, { placement: 'hero', file: 'button.svg', behavior: 'grow' }] })).toMatch(/unknown placement "hero"/);
    expect(problems({ ...MANIFEST, motifs: [...MANIFEST.motifs, { placement: 'button', file: 'button.svg', behavior: 'grow' }] })).toMatch(/button is declared twice/);
    expect(problems({ ...MANIFEST, motifs: [{ placement: 'button', file: 'button.svg', behavior: 'explode' }] })).toMatch(/unknown behavior/);
    expect(problems({ ...MANIFEST, motifs: [{ placement: 'button', file: 'button.svg', behavior: 'steam' }] }, { 'button.svg': FIXTURE_DRAWINGS.button })).toMatch(/labels no data-part="steam"/);
    expect(problems(MANIFEST, { ...GOOD, 'extra.svg': FIXTURE_DRAWINGS.divider })).toMatch(/extra\.svg is not declared/);
    expect(problems(MANIFEST, { 'button.svg': FIXTURE_DRAWINGS.button })).toMatch(/empty\.svg is missing/);
    expect(problems({ ...MANIFEST, topics: { es: ['perro'], en: ['dog', 'pet', 'paw'] } })).toMatch(/topics\.es/);
    const nine = Array.from({ length: 9 }, (_, i) => `f${i}.svg`);
    expect(problems({ ...MANIFEST, motifs: nine.slice(0, 8).map((file, i) => ({ placement: MOTIF_PACK_PLACEMENTS[i], file, behavior: 'grow' })).concat([{ placement: 'button', file: 'f8.svg', behavior: 'grow' }]) }, Object.fromEntries(nine.map(file => [file, FIXTURE_DRAWINGS.divider])))).toMatch(/9 files, at most 8/);
  });

  it('lists nothing when the library folder does not exist', () => {
    expect(listMotifPacks(join(tmpdir(), 'no-such-motif-packs'))).toEqual([]);
  });
});

describe('config.js motifPack', () => {
  it('keeps a clean pack as it is, and cleans or drops what a hand edit broke', () => {
    const pack = fixturePack();
    expect(sanitizeRuntimeMotifPack(pack)).toEqual(pack);
    const broken = { id: pack.id, motifs: [
      { placement: 'hero', behavior: 'grow', svg: FIXTURE_DRAWINGS.button },
      { placement: 'button', behavior: 'explode', svg: FIXTURE_DRAWINGS.button },
      { placement: 'card', behavior: 'bounce', svg: HOSTILE['a script'] },
      { placement: 'empty', behavior: 'steam', svg: '<img src=x onerror=alert(1)>' },
      { placement: 'cart', behavior: 'bounce', svg: FIXTURE_DRAWINGS.button },
      { placement: 'cart', behavior: 'spin', svg: FIXTURE_DRAWINGS.button },
    ] };
    const cleaned = sanitizeRuntimeMotifPack(broken)!;
    expect(cleaned.motifs.map(motif => motif.placement)).toEqual(['card', 'cart']);
    expect(cleaned.motifs[0].svg).not.toContain('script');
    for (const value of [undefined, null, 'paws', [], { id: 'Bad Id', motifs: pack.motifs }, { id: 'paws', motifs: 'x' }, { id: 'paws', motifs: [] }]) expect(sanitizeRuntimeMotifPack(value)).toBeUndefined();
    expect(sanitizeRuntimeMotifPack({ id: 'paws', motifs: [...pack.motifs, ...pack.motifs] })!.motifs).toHaveLength(8);
  });

  it('is re-sanitised on every save, next to motifs', () => {
    const config = (value: object) => ({ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(value)};`, encoding: 'utf8' as const });
    const read = (files: Array<{ path: string; content: string }>) => JSON.parse(files.find(f => f.path === 'config.js')!.content.match(/=\s*([\s\S]*?);?\s*$/)![1]);
    const clean = [config({ slug: 's', motifPack: fixturePack() })];
    expect(withSanitizedMotifs(clean).files).toBe(clean);
    const hostile = withSanitizedMotifs([config({ slug: 's', motifPack: { id: 'paws', motifs: [{ placement: 'button', behavior: 'bounce', svg: HOSTILE['a script'] }, { placement: 'card', behavior: 'bounce', svg: FIXTURE_DRAWINGS.button }] } })]);
    expect(hostile.repairs).toEqual(['config.js: motif pack re-sanitised']);
    expect(JSON.stringify(read(hostile.files))).not.toContain('script');
    const junk = withSanitizedMotifs([config({ slug: 's', motifPack: 'paws' })]);
    expect(junk.repairs).toEqual(['config.js: motif pack dropped']);
    expect(read(junk.files)).toEqual({ slug: 's' });
  });
});

describe('chosenMotifPack', () => {
  it("uses this run's pack, removes it on null, and otherwise keeps what the store had", () => {
    const icecream = loadMotifPack('icecream')!;
    expect(chosenMotifPack('icecream', undefined)).toEqual(icecream);
    expect(chosenMotifPack(null, icecream)).toBeUndefined();
    expect(chosenMotifPack(undefined, icecream)?.id).toBe('icecream');
    expect(chosenMotifPack(undefined, undefined)).toBeUndefined();
    // A pack that no longer loads (deleted or broken since the checkpoint) keeps the store's pack instead of removing it.
    expect(chosenMotifPack('no-such-pack', icecream)?.id).toBe('icecream');
  });
});

describe('snapshotWithMotifPack', () => {
  const snapshot = { files: [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"dacho","motifPack":{"id":"coffee","motifs":[]}};' }, { path: 'index.html', content: '<h1>x</h1>' }] };
  it('sets, replaces and removes config.motifPack without touching other keys or files', () => {
    const set = snapshotWithMotifPack(snapshot, loadMotifPack('icecream'));
    const config = JSON.parse(set.files[0].content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;$/, ''));
    expect(config.slug).toBe('dacho');
    expect(config.motifPack.id).toBe('icecream');
    expect(set.files[1]).toBe(snapshot.files[1]);
    expect(snapshotWithMotifPack(snapshot, undefined).files[0].content).not.toContain('motifPack');
  });
});

describe('snapshotWithMotifPack on a config it cannot read', () => {
  it('leaves the file untouched instead of failing every preview', () => {
    const odd = { files: [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {broken' }] };
    expect(snapshotWithMotifPack(odd, loadMotifPack('icecream'))).toEqual(odd);
  });
});
