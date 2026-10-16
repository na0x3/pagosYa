import { runChatKitTouch } from './source-sep5-review';

/** Spec 2026-10-15 free commerce surfaces: a part request redesigns the part; the kit touch must not also restyle it. */
describe('runChatKitTouch skip', () => {
  const run = (skip: boolean) => {
    const assembleSave = jest.fn(async () => { throw new Error('touch started'); });
    const facts: any = { config: { get: (key: string) => key === 'app.yapiKitTouch' }, logger: { log: jest.fn(), warn: jest.fn() }, runId: 'r', slug: 's', dto: { instruction: 'haz el carrito más bonito', brief: {} }, claude: false, data: {}, sitePurpose: 'shop', creative: false, started: Date.now(), runTimeout: 10 * 60_000, signal: new AbortController().signal, attempts: [] };
    return { assembleSave, done: runChatKitTouch({ facts, live: {} as any, touchCall: jest.fn() as any, assembleSave: assembleSave as any, skip }) };
  };
  it('never starts on a surfaces request', async () => {
    const { assembleSave, done } = run(true);
    await done;
    expect(assembleSave).not.toHaveBeenCalled();
  });
  it('still starts on the same request without the skip (control)', async () => {
    const { assembleSave, done } = run(false);
    await done.catch(() => {});
    expect(assembleSave).toHaveBeenCalled();
  });
});
