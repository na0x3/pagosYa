import { SOURCE_PROGRESS_LABELS, createSourceProgress } from './source-progress';

it('records real milestones, preserves a failed check on repair and stops after completion', async () => {
  const persist = jest.fn().mockResolvedValue(undefined);
  const workflow = createSourceProgress(persist);
  await workflow.report('building');
  expect(persist.mock.calls[0][0].steps).toEqual([expect.objectContaining({ stage: 'building', status: 'running' })]);
  await workflow.report('validating');
  await workflow.report('repairing');
  await workflow.report('validating');
  await workflow.report('saving');
  await workflow.finish('completed');
  await workflow.report('building');
  expect(workflow.value.status).toBe('completed');
  expect(workflow.value.steps.map(step => step.status)).toEqual(['completed', 'failed', 'completed', 'completed', 'completed']);
  expect(persist.mock.calls[0][0].steps).toHaveLength(1);
  expect(workflow.value.steps).toHaveLength(5);
});

it('does not let unavailable progress storage fail a build', async () => {
  const workflow = createSourceProgress(async () => { throw new Error('Database temporarily unavailable'); });
  await expect(workflow.report('building')).resolves.toBeUndefined();
  await workflow.finish('failed');
  expect(workflow.value.steps.at(-1)?.status).toBe('failed');
});

describe('agent step details', () => {
  it('attach to the running step and keep only the last eight thumbnails', async () => {
    const saved: any[] = [];
    const progress = createSourceProgress(async value => saved.push(value));
    await progress.report('building');
    for (let i = 0; i < 10; i++) await progress.report.detail!({ label: `Tomó una captura (${i})`, thumbnail: 'data:image/jpeg;base64,AAAA' });
    const details = progress.value.steps[0].details!;
    expect(details).toHaveLength(10);
    expect(details.filter(d => d.thumbnail)).toHaveLength(8);
    expect(details[0].thumbnail).toBeUndefined();
    expect(saved.at(-1).steps[0].details).toHaveLength(10);
  });
  it('are ignored once the work has finished', async () => {
    const progress = createSourceProgress(async () => undefined);
    await progress.report('building');
    await progress.finish('completed');
    await progress.report.detail!({ label: 'tarde' });
    expect(progress.value.steps[0].details).toBeUndefined();
  });
});

it('labels the commerce surfaces stage (spec 2026-10-15)', () => {
  expect((SOURCE_PROGRESS_LABELS as Record<string, string>).commerce).toBe('Diseñando carrito, productos y pago');
});
