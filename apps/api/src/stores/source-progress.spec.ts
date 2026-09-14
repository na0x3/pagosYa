import { createSourceProgress } from './source-progress';

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
