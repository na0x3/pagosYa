import { templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from './source-templates';
import { nextSourceFile } from './source-next';
import { homeWriterInstructions, runHomeWriterLoop } from './source-home-writer-stage';
import { HOME_PATH } from './agent/home-writer-tools';

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
