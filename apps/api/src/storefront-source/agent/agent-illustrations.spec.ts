import sharp from 'sharp';
import { searchIllustrations } from './agent-illustrations';
import { AgentToolbox, AGENT_TOOLS } from './agent-tools';
import { AgentWorkspace } from './agent-workspace';

const toolbox = () => new AgentToolbox({ workspace: new AgentWorkspace([], { redesign: false }), previous: [], base: {} as never, instruction: 'dibujos de helado', purpose: 'shop', maxScreenshots: 0 } as never);

describe('search_illustrations', () => {
  it('returns numbered paths and a contact sheet the model can look at', async () => {
    const result = await searchIllustrations('helado', null);
    const { matches, use } = JSON.parse(result.output);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThanOrEqual(12);
    expect(matches[0]).toEqual(expect.objectContaining({ n: 1, path: expect.stringMatching(/^assets\/creative\//), tone: expect.stringMatching(/^(colour|store)$/) }));
    expect(use).toContain('<Illustration');
    expect(result.image).toMatch(/^data:image\/jpeg;base64,/);
    expect((await sharp(Buffer.from(result.image!.split(',')[1], 'base64')).metadata()).width).toBe(640);
  });
  it('shows distinct subjects, one tile each, with their other styles as exact variant paths', async () => {
    const { matches } = JSON.parse((await searchIllustrations('helado', 'colour')).output);
    const subjects = matches.map((match: any) => match.subject);
    expect(new Set(subjects).size).toBe(subjects.length);
    const cone = matches.find((match: any) => match.subject === 'soft-ice-cream');
    expect(cone.path).toBe('assets/creative/fluent-flat/soft-ice-cream.svg');
    expect(cone.variants).toEqual(expect.arrayContaining(['assets/creative/fluent-color/soft-ice-cream.svg', 'assets/creative/fluent-3d/soft-ice-cream.png']));
    const store = JSON.parse((await searchIllustrations('helado', 'store')).output).matches;
    expect(store.find((match: any) => match.subject === 'soft-ice-cream').path).toBe('assets/creative/fluent-mono/soft-ice-cream.svg');
  });
  it('fills twelve different subjects, lets a motif pack take at most two tiles, and lists every style of each subject', async () => {
    const fruit = JSON.parse((await searchIllustrations('fruta', null)).output).matches;
    expect(new Set(fruit.map((match: any) => match.subject)).size).toBe(12);
    for (const match of fruit) if (match.family === 'fluent-flat') expect(match.variants).toEqual(expect.arrayContaining([`assets/creative/fluent-color/${match.subject}.svg`, `assets/creative/fluent-mono/${match.subject}.svg`]));
    const icecream = JSON.parse((await searchIllustrations('helados', null)).output).matches;
    expect(icecream.filter((match: any) => match.family === 'motif-icecream').length).toBeLessThanOrEqual(2);
  });
  it('says plainly when nothing matches, without a sheet', async () => {
    const result = await searchIllustrations('de la con', null);
    expect(result.output).toMatch(/No hay ilustraciones/);
    expect(result.image).toBeUndefined();
  });
  it('is a strict tool the toolbox runs, recording a step', async () => {
    const tool = AGENT_TOOLS.find(t => t.name === 'search_illustrations') as any;
    expect(tool.strict).toBe(true);
    expect(Object.keys(tool.parameters.properties).sort()).toEqual(['query', 'tone']);
    const box = toolbox();
    const result = await box.run('search_illustrations', JSON.stringify({ query: 'fresa', tone: 'colour' }));
    expect(JSON.parse(result.output).matches.every((match: any) => match.tone === 'colour')).toBe(true);
    expect(box.steps.at(-1)).toEqual(expect.objectContaining({ kind: 'search_illustrations', label: 'Buscó ilustraciones: fresa' }));
  });
});
