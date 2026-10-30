import { templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from './source-templates';
import { nextSourceFile } from './source-next';
import { homeWriterDna, homeWriterInstructions, homeWriterLimits, homeWriterTask, runHomeWriterLoop, runHomeWriterStage } from './source-home-writer-stage';
import { HOME_DIRECTIONS } from './home-directions';
import { HOME_PATH, HOME_WRITER_LIMITS } from './agent/home-writer-tools';
import { masterThemeBlock, withMasterTheme } from './source-master';
import { SOURCE_FONT_IDS } from './source-font-catalog';
import { SourceRequestBudget } from './source-request-budget';
import { openAiAgentModel } from './agent/agent-model';

jest.mock('./agent/agent-model', () => ({ ...jest.requireActual('./agent/agent-model'), openAiAgentModel: jest.fn() }));

// Spec 2026-10-29 home page writer §5: the loop on its own, with a scripted model and the real Esencial files.
jest.setTimeout(240_000);
let base: Awaited<ReturnType<typeof templateDemoRevision>>;
beforeAll(async () => { base = await templateDemoRevision(templateManifest('esencial')!, templateSourceFiles('esencial')); });
let n = 0;
const call = (name: string, args: object) => ({ name, arguments: JSON.stringify(args), callId: `h${n++}` });
const authored = () => base.files.filter(f => nextSourceFile(f.path));
const brand = (font: string) => ({ paper: '#f4efe6', ink: '#1d2a22', muted: '#e8e1d4', accent: '#b5562b', deep: '#2f4a33', heading: font, body: font });

describe('home writer stage', () => {
  it('tells the model the rules that matter', () => {
    const text = homeWriterInstructions();
    for (const rule of [/<Shell>/, /texto JSX literal/i, /72 px/, /una sola vez/i, /banda oscura/i, /data-pagosya-catalog/, /read_chassis/, /--es-deep/]) expect(text).toMatch(rule);
  });
  it('a run that writes, brands, checks and finishes hands back only the home and globals', async () => {
    const home = authored().find(f => f.path === HOME_PATH)!.content.replace('export default function Home', 'export default function Home /* writer */');
    const font = 'placeholder';
    const turns: any[] = [{ calls: [call('read_chassis', {})] }, { calls: [call('write_home', { content: home })] }, null, { calls: [call('check', {})] }, { calls: [call('finish', { summary: 'Nueva portada.' })] }];
    let i = 0, firstFont = font;
    const out = await runHomeWriterLoop({ model: async ({ transcript }) => {
      const turn = turns[Math.min(i++, turns.length - 1)];
      if (turn) return turn;
      // set_tokens with the first catalog font read_chassis named.
      firstFont = /fuentes: ([a-z0-9-]+) \(/.exec(JSON.stringify(transcript))![1];
      return { calls: [call('set_tokens', brand(firstFont))] };
    }, files: authored(), base, gate: async () => null, task: 'Gramiyaa' });
    expect(out).toMatchObject({ accepted: true, summary: 'Nueva portada.' });
    expect(out.changed.sort()).toEqual([HOME_PATH, 'styles/globals.css']);
  });
  it('a run that never gets a clean check is not accepted, so the template home stays', async () => {
    const bad = `import Shell from './Shell';\nexport default function Home() { return <Shell><main><section><h1>Sin productos</h1></section></main></Shell>; }`;
    const out = await runHomeWriterLoop({ model: async () => ({ calls: [call('write_home', { content: bad })] }), files: authored(), base, gate: async () => null, task: 'x', limits: { toolCalls: 3 } });
    expect(out.accepted).toBe(false);
  });
});

describe('home writer review fixes (2026-10-29)', () => {
  // A store whose deep is already the brand's: its template home has nothing blocking.
  const branded = () => authored().map(f => f.path === 'styles/globals.css' ? { ...f, content: withMasterTheme(f.content, masterThemeBlock({ paper: '#f4efe6', ink: '#1d2a22', muted: '#e8e1d4', accent: '#b5562b', deep: '#2f4a33' }, SOURCE_FONT_IDS[0], SOURCE_FONT_IDS[0])) } : f);
  it('a run that changes nothing is not a new design', async () => {
    const files = branded();
    const turns = [{ calls: [call('read_chassis', {})] }, { calls: [call('check', {})] }, { calls: [call('finish', { summary: 'Listo.' })] }];
    let i = 0;
    const out = await runHomeWriterLoop({ model: async () => turns[Math.min(i++, turns.length - 1)], files, base: { ...base, files: [...base.files.filter(f => f.path !== 'styles/globals.css'), files.find(f => f.path === 'styles/globals.css')!] }, gate: async () => null, task: 'x', limits: { toolCalls: 6 } });
    expect(out.accepted).toBe(false);
  });
  it('its wall clock doubles on the ChatGPT plan and never passes the run\'s own deadline', () => {
    const now = 1_000_000;
    expect(homeWriterLimits(false, now + 3_600_000, now).wallMs).toBe(HOME_WRITER_LIMITS.wallMs);
    expect(homeWriterLimits(true, now + 3_600_000, now).wallMs).toBe(HOME_WRITER_LIMITS.wallMs * 2);
    expect(homeWriterLimits(true, now + 400_000, now).wallMs).toBeLessThan(400_000);
    expect(homeWriterLimits(true, now + 400_000, now).toolCalls).toBe(HOME_WRITER_LIMITS.toolCalls);
  });
  it('the stage asks the model with a prompt cache key, low reasoning and the run\'s limits', async () => {
    const options: any[] = [];
    (openAiAgentModel as jest.Mock).mockImplementation((opts: any) => { options.push(opts); return async () => { throw Object.assign(new Error('stop'), {}); }; });
    const facts: any = { prisma: { storeSourceGeneration: { updateMany: jest.fn() } }, config: { get: () => undefined }, metering: undefined, storeId: 's1', runId: 'r1', dto: { brief: base.brief, instruction: 'Diseña la portada' },
      plan: { model: 'gpt-5.6-terra', maxOutputTokens: 8000 }, provider: { endpoint: 'e', name: 'OpenAI' }, apiKey: 'k', agentProvider: null, budget: new SourceRequestBudget(50), signal: undefined, attempts: [],
      progress: undefined, previousFiles: base.files, oldFiles: base.files, assets: [], images: [], data: { storeName: 'x' }, chatgptPlan: true, started: Date.now(), runTimeout: 3_600_000 };
    const live: any = { generated: { label: '', files: [] }, lenient: false };
    await expect(runHomeWriterStage({ facts, live, acceptCandidate: async () => undefined, resume: {} as any })).rejects.toThrow(/portada/);
    expect(options[0]).toMatchObject({ reasoningEffort: 'low', model: 'gpt-5.6-terra' });
    expect(typeof options[0].promptCacheKey).toBe('string');
  });
});

// Live check 2026-10-29 (PEPPA c6vo5nuz): the writer's save re-rolled border and frame; it keeps every look key but the fonts.
describe('homeWriterDna', () => {
  const previous = { version: 1, display: 'bebas-neue', text: 'manrope', border: 'hairline', frame: 'bleed', button: 'pill', radius: 'round' };
  it('keeps the previous look and takes the fonts the writer chose', () => {
    const css = withMasterTheme('body{}', masterThemeBlock({ paper: '#f4efe6', ink: '#1d2a22', muted: '#e8e1d4', accent: '#b5562b', deep: '#2f4a33' }, SOURCE_FONT_IDS[0], SOURCE_FONT_IDS[1]));
    expect(homeWriterDna(previous, css)).toEqual({ ...previous, display: SOURCE_FONT_IDS[0], text: SOURCE_FONT_IDS[1] });
  });
  it('one font for both, or no theme block, behaves', () => {
    const one = withMasterTheme('', masterThemeBlock({ paper: '#f4efe6', ink: '#1d2a22', muted: '#e8e1d4', accent: '#b5562b', deep: '#2f4a33' }, SOURCE_FONT_IDS[2], SOURCE_FONT_IDS[2]));
    expect(homeWriterDna(previous, one)).toMatchObject({ display: SOURCE_FONT_IDS[2], text: SOURCE_FONT_IDS[2], border: 'hairline' });
    expect(homeWriterDna(previous, 'body{}')).toEqual(previous);
    expect(homeWriterDna(undefined, 'body{}')).toBeUndefined();
  });
});

// Spec 2026-10-30 home writer variety: the task carries the store's direction, what recent stores used, and motion only when animated.
describe('homeWriterTask', () => {
  const avoid = { fonts: ['Fraunces', 'Gloock'], papers: ['#f4efe6'] };
  it('carries the direction brief and the recent looks to avoid', () => {
    const task = homeWriterTask({ instruction: 'Diseña la portada', storeName: 'Oh Belly', direction: 'lookbook', animated: false, avoid });
    expect(task).toContain(HOME_DIRECTIONS.lookbook);
    expect(task).toMatch(/Fraunces[\s\S]*Gloock/);
    expect(task).toContain('#f4efe6');
    expect(task).not.toContain('MOVIMIENTO');
  });
  it('adds the motion brief only to an animated store', () => {
    expect(homeWriterTask({ instruction: 'x', storeName: 'y', direction: 'bandas', animated: true, avoid: { fonts: [], papers: [] } })).toContain('MOVIMIENTO');
  });
});
