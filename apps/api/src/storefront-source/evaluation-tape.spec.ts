import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SourceRequestBudget } from './source-request-budget';
import { openAiAgentModel } from './agent/agent-model';
import { createModelTape, fingerprintOf, installModelTape, isModelCall, normalizeVolatile, pinAsyncMethods, readCaseMeta, readRecordingMeta, ReplayMismatchError, writeCaseOutcome, writeRecordingMeta, type RecordedExchange } from './evaluation-tape';

const OPENAI = 'https://api.openai.com/v1/responses';
const BRIDGE = 'http://127.0.0.1:54321/v1/responses';
const post = (body: unknown) => ({ method: 'POST', headers: { Authorization: 'Bearer secret-key', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

/** A hand-written recording: the shape --record leaves on disk. */
function writeFixture(dir: string, caseId: string, calls: Array<{ body: Record<string, unknown>; reply: unknown; status?: number }>, chance: Record<string, unknown[]> = {}) {
  const folder = join(dir, 'cases', `${caseId}--run1`);
  mkdirSync(join(folder, 'calls'), { recursive: true });
  writeFileSync(join(folder, 'case.json'), JSON.stringify({ caseId, run: 1, brief: { businessName: 'Café' }, storeId: 'store-1' }));
  writeFileSync(join(folder, 'chance.json'), JSON.stringify(chance));
  writeFileSync(join(folder, 'outcome.json'), JSON.stringify({ status: 'ungraded', repairs: 2 }));
  calls.forEach((call, i) => {
    const exchange: RecordedExchange = { index: i + 1, startedAt: '2026-10-13T00:00:00.000Z', durationMs: 10, request: { method: 'POST', url: OPENAI, body: call.body }, fingerprint: fingerprintOf('POST', OPENAI, call.body), response: { status: call.status ?? 200, statusText: '', headers: { 'content-type': 'application/json' }, body: JSON.stringify(call.reply) } };
    writeFileSync(join(folder, 'calls', `${String(i + 1).padStart(4, '0')}.json`), JSON.stringify(exchange));
  });
}

describe('evaluation tape', () => {
  let dir: string;
  let restore: (() => void) | undefined;
  const target = { fetch: jest.fn() as unknown as typeof fetch };
  // The network the tape wraps: kept apart because installing the tape replaces target.fetch.
  let network: jest.Mock;
  const useNetwork = (mock: jest.Mock) => { network = mock; target.fetch = mock as unknown as typeof fetch; };
  const logged: string[] = [];
  const log = (line: string) => { logged.push(line); };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'yapi-tape-'));
    useNetwork(jest.fn());
    logged.length = 0;
  });
  afterEach(() => { restore?.(); restore = undefined; rmSync(dir, { recursive: true, force: true }); });

  it('recognises model providers only: OpenAI, Anthropic and the ChatGPT bridge on any port', () => {
    expect(isModelCall(OPENAI)).toBe(true);
    expect(isModelCall('https://api.openai.com/v1/images/edits')).toBe(true);
    expect(isModelCall('https://api.anthropic.com/v1/messages')).toBe(true);
    expect(isModelCall(BRIDGE)).toBe(true);
    expect(isModelCall('http://localhost:61000/v1/responses')).toBe(true);
    expect(isModelCall('http://127.0.0.1:3001/v1/stores')).toBe(false);
    expect(isModelCall('https://cdn.shopify.com/a.png')).toBe(false);
    expect(isModelCall('not a url')).toBe(false);
  });

  it('records each model exchange in order without the credentials, and hands the caller an unread response', async () => {
    network.mockResolvedValueOnce(json({ status: 'completed', output: ['first'] })).mockResolvedValueOnce(json({ status: 'completed', output: ['second'] }));
    const tape = createModelTape('record', dir, { log });
    restore = installModelTape(tape, target);
    tape.startCase('hero', 1, { brief: { businessName: 'Café' }, storeId: 'store-1' });
    const first = await target.fetch(OPENAI, post({ model: 'gpt-5', instructions: 'Plan the store', input: [{ role: 'user', content: 'one' }] }));
    const second = await target.fetch(BRIDGE, post({ model: 'gpt-5', instructions: 'Write the store', input: 'two', tools: [{ name: 'write_file' }] }));
    expect((await first.json()).output).toEqual(['first']);
    expect((await second.json()).output).toEqual(['second']);
    tape.finishCase();
    writeCaseOutcome(dir, 'hero', 1, { status: 'ungraded', repairs: 1 });

    const folder = join(dir, 'cases', 'hero--run1');
    expect(readdirSync(join(folder, 'calls'))).toEqual(['0001.json', '0002.json']);
    const call1 = JSON.parse(readFileSync(join(folder, 'calls', '0001.json'), 'utf8'));
    const call2 = JSON.parse(readFileSync(join(folder, 'calls', '0002.json'), 'utf8'));
    expect(call1.request.body.instructions).toBe('Plan the store');
    expect(JSON.parse(call1.response.body).output).toEqual(['first']);
    expect(call2.fingerprint).toMatchObject({ endpoint: 'POST chatgpt-bridge/v1/responses', model: 'gpt-5', tools: 'write_file' });
    expect(readFileSync(join(folder, 'calls', '0001.json'), 'utf8')).not.toContain('secret-key');
    expect(readCaseMeta(dir, 'hero', 1)).toMatchObject({ caseId: 'hero', run: 1, storeId: 'store-1', brief: { businessName: 'Café' } });
    expect(JSON.parse(readFileSync(join(folder, 'outcome.json'), 'utf8'))).toEqual({ status: 'ungraded', repairs: 1 });
  });

  it('passes non-provider fetches through untouched, in both modes', async () => {
    for (const mode of ['record', 'replay'] as const) {
      writeFixture(dir, 'hero', []);
      const passthrough = json({ ok: true });
      useNetwork(jest.fn().mockResolvedValue(passthrough));
      const tape = createModelTape(mode, dir, { log });
      restore = installModelTape(tape, target);
      tape.startCase('hero', 1);
      const init = { headers: { accept: 'image/*' } };
      expect(await target.fetch('https://cdn.shopify.com/a.png', init)).toBe(passthrough);
      expect(network).toHaveBeenCalledWith('https://cdn.shopify.com/a.png', init);
      expect(tape.finishCase().calls).toBe(0);
      restore(); restore = undefined;
    }
  });

  it('replays the recorded responses in order with no network model call', async () => {
    writeFixture(dir, 'hero', [
      { body: { model: 'gpt-5', instructions: 'Plan the store', input: 'one' }, reply: { status: 'completed', output: ['plan'] } },
      { body: { model: 'gpt-5', instructions: 'Write the store', input: 'two' }, reply: { status: 'completed', output: ['source'] } },
    ]);
    const tape = createModelTape('replay', dir, { log });
    restore = installModelTape(tape, target);
    expect(tape.startCase('hero', 1)).toMatchObject({ caseId: 'hero', brief: { businessName: 'Café' } });
    const first = await target.fetch(OPENAI, post({ model: 'gpt-5', instructions: 'Plan the store', input: 'one' }));
    const second = await target.fetch(OPENAI, post({ model: 'gpt-5', instructions: 'Write the store', input: 'two' }));
    expect(first.status).toBe(200);
    expect((await first.json()).output).toEqual(['plan']);
    expect((await second.json()).output).toEqual(['source']);
    expect(network).not.toHaveBeenCalled();
    expect(tape.finishCase()).toMatchObject({ calls: 2, recorded: 2, unused: 0, drift: [], recordedOutcome: { status: 'ungraded', repairs: 2 } });
  });

  it('round-trips: what a recording keeps, a replay serves, including a provider error status', async () => {
    network.mockResolvedValueOnce(json({ error: { code: 'rate_limit' } }, 429)).mockResolvedValueOnce(json({ status: 'completed', output: ['ok'] }));
    const recorder = createModelTape('record', dir, { log });
    restore = installModelTape(recorder, target);
    recorder.startCase('retry', 1);
    const ask = () => target.fetch(BRIDGE.replace('54321', '60000'), post({ model: 'gpt-5', instructions: 'Plan', input: 'x' }));
    await ask(); await ask();
    recorder.finishCase();
    restore(); restore = undefined;

    useNetwork(jest.fn(() => { throw new Error('network must not be used'); }));
    const replayer = createModelTape('replay', dir, { log });
    restore = installModelTape(replayer, target);
    replayer.startCase('retry', 1);
    // The bridge listens on a new port each launch; the replay does not care.
    const limited = await target.fetch(BRIDGE, post({ model: 'gpt-5', instructions: 'Plan', input: 'x' }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: { code: 'rate_limit' } });
    expect((await (await target.fetch(BRIDGE, post({ model: 'gpt-5', instructions: 'Plan', input: 'x' }))).json()).output).toEqual(['ok']);
    expect(replayer.finishCase()).toMatchObject({ calls: 2, unused: 0 });
  });

  it('fails loudly, naming the case and call, when the code asks for more calls than recorded', async () => {
    writeFixture(dir, 'hero', [{ body: { model: 'gpt-5', instructions: 'Plan', input: 'one' }, reply: { output: [] } }]);
    const tape = createModelTape('replay', dir, { log });
    restore = installModelTape(tape, target);
    tape.startCase('hero', 1);
    await target.fetch(OPENAI, post({ model: 'gpt-5', instructions: 'Plan', input: 'one' }));
    const extra = target.fetch(OPENAI, post({ model: 'gpt-5', instructions: 'Plan', input: 'one' }));
    await expect(extra).rejects.toThrow(ReplayMismatchError);
    await expect(extra).rejects.toThrow(/case "hero" run 1: call #2 .*recording has 1 model call and all were already served/);
    // Every later call is refused too, and the case reports the first mismatch even if the build recovers.
    await expect(target.fetch(OPENAI, post({ model: 'gpt-5', instructions: 'Plan', input: 'one' }))).rejects.toThrow(/call #3 .*refused/);
    expect(tape.finishCase().mismatch).toMatch(/call #2/);
    expect(logged.join('\n')).toMatch(/call #2/);
    expect(network).not.toHaveBeenCalled();
  });

  it('fails loudly on a changed prompt, pointing at where it changed', async () => {
    writeFixture(dir, 'hero', [{ body: { model: 'gpt-5', instructions: 'Plan a calm store for a café.', input: 'one' }, reply: { output: [] } }]);
    const tape = createModelTape('replay', dir, { log });
    restore = installModelTape(tape, target);
    tape.startCase('hero', 1);
    await expect(target.fetch(OPENAI, post({ model: 'gpt-5', instructions: 'Plan a bold store for a café.', input: 'one' })))
      .rejects.toThrow(/case "hero" run 1: call #1 .*instructions \(the prompt\) changed, first difference at character 7/);
    expect(network).not.toHaveBeenCalled();
  });

  it('fails on a different model or input by default, and serves a changed input as drift only when loose', async () => {
    const calls = [{ body: { model: 'gpt-5', instructions: 'Agent', input: [{ role: 'tool', output: 'preflight: 2 issues' }] }, reply: { output: ['fixed'] } }];
    writeFixture(dir, 'hero', calls);
    const strict = createModelTape('replay', dir, { log });
    restore = installModelTape(strict, target);
    strict.startCase('hero', 1);
    await expect(target.fetch(OPENAI, post({ model: 'gpt-5-mini', instructions: 'Agent', input: calls[0].body.input }))).rejects.toThrow(/model: recorded gpt-5, now gpt-5-mini/);
    strict.finishCase();
    strict.startCase('hero', 1);
    await expect(target.fetch(OPENAI, post({ model: 'gpt-5', instructions: 'Agent', input: [{ role: 'tool', output: 'preflight: 0 issues' }] }))).rejects.toThrow(/input changed/);
    strict.finishCase();
    restore(); restore = undefined;

    const loose = createModelTape('replay', dir, { log, loose: true });
    restore = installModelTape(loose, target);
    loose.startCase('hero', 1);
    expect((await (await target.fetch(OPENAI, post({ model: 'gpt-5', instructions: 'Agent', input: [{ role: 'tool', output: 'preflight: 0 issues' }] }))).json()).output).toEqual(['fixed']);
    const report = loose.finishCase();
    expect(report.mismatch).toBeUndefined();
    expect(report.drift).toEqual([expect.stringMatching(/call #1 .*served recorded call #1 although its input differs/)]);
  });

  it('ignores ids, dates and clock readings that change on every run', async () => {
    writeFixture(dir, 'hero', [{ body: { model: 'gpt-5', instructions: 'Run 3f2b8c1e-1111-4222-8333-444455556666 on 2026-10-12 at 2026-10-12T10:00:00.000Z (1760300000000)', input: 'one' }, reply: { output: ['ok'] } }]);
    const tape = createModelTape('replay', dir, { log });
    restore = installModelTape(tape, target);
    tape.startCase('hero', 1);
    const response = await target.fetch(OPENAI, post({ model: 'gpt-5', instructions: 'Run 9a9b9c9d-aaaa-4bbb-8ccc-ddddeeeeffff on 2026-10-13 at 2026-10-13T11:22:33.000Z (1760400000000)', input: 'one' }));
    expect((await response.json()).output).toEqual(['ok']);
    expect(normalizeVolatile('store clx1a2b3c4d5e6f7g8h9i0j1k')).toBe('store <id>');
  });

  it('serves concurrent calls that arrive in another order to the request each belongs to', async () => {
    writeFixture(dir, 'styles', [
      { body: { model: 'gpt-5', instructions: 'Style', input: 'slot A' }, reply: { output: ['A'] } },
      { body: { model: 'gpt-5', instructions: 'Style', input: 'slot B' }, reply: { output: ['B'] } },
    ]);
    const tape = createModelTape('replay', dir, { log });
    restore = installModelTape(tape, target);
    tape.startCase('styles', 1);
    const [b, a] = await Promise.all([target.fetch(OPENAI, post({ model: 'gpt-5', instructions: 'Style', input: 'slot B' })), target.fetch(OPENAI, post({ model: 'gpt-5', instructions: 'Style', input: 'slot A' }))]);
    expect((await a.json()).output).toEqual(['A']);
    expect((await b.json()).output).toEqual(['B']);
  });

  it('replays a recorded network failure as the same thrown error', async () => {
    network.mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }));
    const recorder = createModelTape('record', dir, { log });
    restore = installModelTape(recorder, target);
    recorder.startCase('flaky', 1);
    await expect(target.fetch(OPENAI, post({ model: 'gpt-5', instructions: 'x', input: 'y' }))).rejects.toThrow('fetch failed');
    recorder.finishCase();
    restore(); restore = undefined;

    const replayer = createModelTape('replay', dir, { log });
    restore = installModelTape(replayer, target);
    replayer.startCase('flaky', 1);
    await expect(target.fetch(OPENAI, post({ model: 'gpt-5', instructions: 'x', input: 'y' }))).rejects.toMatchObject({ name: 'TypeError', message: 'fetch failed', cause: { code: 'ECONNRESET' } });
  });

  it('refuses a replayed model call outside any case, and a case that was never recorded', async () => {
    const tape = createModelTape('replay', dir, { log });
    restore = installModelTape(tape, target);
    await expect(target.fetch(OPENAI, post({ model: 'gpt-5' }))).rejects.toThrow(/outside any case/);
    expect(() => tape.startCase('missing', 2)).toThrow(/No recording for case "missing" run 2/);
    expect(network).not.toHaveBeenCalled();
  });

  it('records the run\'s chance and serves it back, then goes live with a note once it runs out', async () => {
    const recorder = createModelTape('record', dir, { log });
    restore = installModelTape(recorder, target);
    const lookups = { recentFrameDraws: jest.fn(async () => [{ frame: 'split' }]) };
    pinAsyncMethods(recorder, lookups, 'projects', ['recentFrameDraws']);
    recorder.startCase('draws', 1);
    const drawn = [Math.random(), Math.random()];
    expect(await (lookups as any).recentFrameDraws('store-1')).toEqual([{ frame: 'split' }]);
    recorder.finishCase();
    restore(); restore = undefined;
    expect(JSON.parse(readFileSync(join(dir, 'cases', 'draws--run1', 'chance.json'), 'utf8'))).toEqual({ 'Math.random': drawn, 'projects.recentFrameDraws': [[{ frame: 'split' }]] });

    const replayer = createModelTape('replay', dir, { log });
    restore = installModelTape(replayer, target);
    const liveLookup = jest.fn(async () => [{ frame: 'changed in the DB' }]);
    const live = { recentFrameDraws: liveLookup };
    pinAsyncMethods(replayer, live, 'projects', ['recentFrameDraws']);
    replayer.startCase('draws', 1);
    expect([Math.random(), Math.random()]).toEqual(drawn);
    expect(await (live as any).recentFrameDraws('store-1')).toEqual([{ frame: 'split' }]);
    expect(liveLookup).not.toHaveBeenCalled();
    const third = Math.random();
    expect(third).toBeGreaterThanOrEqual(0);
    expect(replayer.finishCase().notes).toEqual(['Math.random: more draws than recorded (2); the rest are live']);
  });

  it('sits under the real agent model, which reaches the provider through the global fetch', async () => {
    const original = globalThis.fetch;
    const provider = jest.fn(async () => json({ status: 'completed', usage: { input_tokens: 10, output_tokens: 5 }, output: [{ type: 'function_call', name: 'write_file', arguments: '{"path":"index.html"}', call_id: 'c1' }] }));
    const turn = async () => openAiAgentModel({ endpoint: BRIDGE, apiKey: 'plan-secret', model: 'gpt-5.6-terra', providerName: 'ChatGPT plan', budget: new SourceRequestBudget(50), maxOutputTokens: 2000, reasoningEffort: 'low' })({ instructions: 'Build the store', transcript: [{ role: 'user', content: 'Café' }] as any, tools: [{ type: 'function', name: 'write_file' }] as any });
    try {
      globalThis.fetch = provider as unknown as typeof fetch;
      const recorder = createModelTape('record', dir, { log });
      restore = installModelTape(recorder, globalThis);
      recorder.startCase('agent', 1);
      const recorded = await turn();
      recorder.finishCase();
      restore(); restore = undefined;
      expect(provider).toHaveBeenCalledTimes(1);

      globalThis.fetch = jest.fn(() => { throw new Error('network must not be used'); }) as unknown as typeof fetch;
      const replayer = createModelTape('replay', dir, { log });
      restore = installModelTape(replayer, globalThis);
      replayer.startCase('agent', 1);
      expect(await turn()).toEqual(recorded);
      expect(recorded.calls).toEqual([{ name: 'write_file', arguments: '{"path":"index.html"}', callId: 'c1' }]);
      await expect(turn()).rejects.toThrow(/call #2/);
      expect(replayer.finishCase().mismatch).toMatch(/case "agent" run 1: call #2/);
    } finally {
      restore?.(); restore = undefined;
      globalThis.fetch = original;
    }
  });

  it('puts fetch and Math.random back when uninstalled', () => {
    const before = target.fetch, random = Math.random;
    const undo = installModelTape(createModelTape('record', dir, { log }), target);
    expect(target.fetch).not.toBe(before);
    undo();
    expect(target.fetch).toBe(before);
    expect(Math.random).toBe(random);
  });

  it('keeps the run metadata next to the cases', () => {
    writeRecordingMeta(dir, { engine: 'agent', storeId: 'store-1', model: 'auto' });
    expect(readRecordingMeta(dir)).toEqual({ version: 1, engine: 'agent', storeId: 'store-1', model: 'auto' });
    expect(() => readRecordingMeta(join(dir, 'nope'))).toThrow(/No recording at .*recording\.json/);
  });
});
