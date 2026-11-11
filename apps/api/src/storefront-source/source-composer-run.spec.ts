import { runComposer, type ComposerDeps } from './source-composer-run';
import type { LayoutBlock } from './source-section-library';

const A: LayoutBlock[] = [{ type: 'cover-mega' }, { type: 'products-rows' }];
const B: LayoutBlock[] = [{ type: 'cover-mega', look: 'tilt' }, { type: 'products-rows' }];
const problem = { problem: 'palabras cortadas', at: 0, kind: 'look' as const, value: 'tilt' };
function deps(over: Partial<ComposerDeps> = {}): ComposerDeps {
  return {
    compose: jest.fn(async () => ({ answer: { blocks: A }, microUsd: 500_000 })),
    validate: jest.fn(answer => answer.blocks as LayoutBlock[]),
    check: jest.fn(() => []),
    capture: jest.fn(async () => ['img']),
    review: jest.fn(async () => ({ problems: [], microUsd: 300_000 })),
    apply: jest.fn(() => ({ layout: B, applied: ['look'], rewrite: [] })),
    rewrite: jest.fn(async layout => ({ layout, microUsd: 100_000 })),
    trace: jest.fn(),
    maxMicroUsd: 10_000_000, ...over };
}

describe('the store composer loop (spec 2026-11-11)', () => {
  it('a clean first review keeps the composed home', async () => {
    expect(await runComposer(deps())).toMatchObject({ layout: A, outcome: 'clean', rounds: 1, spentMicroUsd: 800_000 });
  });
  it('a refused composition is sent back once with its reasons', async () => {
    const check = jest.fn().mockReturnValueOnce(['falta products-rows']).mockReturnValue([]);
    const d = deps({ check });
    const out = await runComposer(d);
    expect(d.compose).toHaveBeenNthCalledWith(2, ['falta products-rows']);
    expect(out.layout).toEqual(A);
  });
  it('a check that keeps failing falls back to fill mode', async () => {
    const d = deps({ check: jest.fn(() => ['muy corta']) });
    expect(await runComposer(d)).toMatchObject({ layout: null, outcome: 'fill' });
    expect(d.compose).toHaveBeenCalledTimes(2);
  });
  it('review changes are applied, checked and reviewed again, up to three rounds', async () => {
    const review = jest.fn(async () => ({ problems: [problem], microUsd: 100_000 }));
    expect(await runComposer(deps({ review }))).toMatchObject({ layout: B, outcome: 'reviewed', rounds: 3 });
    expect(review).toHaveBeenCalledTimes(3);
  });
  it('a change the check refuses keeps the last good home', async () => {
    const check = jest.fn((layout: LayoutBlock[]) => (layout === B ? ['se parece a Miga'] : []));
    const review = jest.fn(async () => ({ problems: [problem], microUsd: 0 }));
    expect((await runComposer(deps({ check, review }))).layout).toEqual(A);
  });
  it('swapped sections get their words before the check', async () => {
    const apply = jest.fn(() => ({ layout: B, applied: ['swap'], rewrite: [1] }));
    const review = jest.fn().mockResolvedValueOnce({ problems: [{ ...problem, kind: 'swap', value: 'story-split' }], microUsd: 0 }).mockResolvedValue({ problems: [], microUsd: 0 });
    const d = deps({ apply, review });
    await runComposer(d);
    expect(d.rewrite).toHaveBeenCalledWith(B, [1]);
  });
  it('the budget stops the reviews and keeps the best home so far', async () => {
    expect(await runComposer(deps({ maxMicroUsd: 400_000 }))).toMatchObject({ layout: A, outcome: 'budget' });
  });
  it('a failed capture or review saves the composed home without a review', async () => {
    expect(await runComposer(deps({ capture: jest.fn(async () => null) }))).toMatchObject({ layout: A, outcome: 'review-skipped' });
    expect(await runComposer(deps({ review: jest.fn(async () => { throw new Error('timeout'); }) }))).toMatchObject({ layout: A, outcome: 'review-skipped' });
  });
  it('a cancel or a spent quota stops the loop', async () => {
    await expect(runComposer(deps({ compose: jest.fn(async () => { throw new Error('quota'); }) }))).rejects.toThrow('quota');
    const controller = new AbortController(); controller.abort();
    await expect(runComposer(deps({ signal: controller.signal }))).rejects.toThrow(/cancel/i);
  });
});
