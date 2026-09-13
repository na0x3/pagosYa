import { SourceVisualReviewService } from './source-visual-review.service';
import { captureSourceVisuals } from './source-visual-capture';
jest.mock('./source-visual-capture', () => ({ captureSourceVisuals: jest.fn() }));
const capture = captureSourceVisuals as jest.Mock;
const shot = { viewport: 'desktop', width: 1280, height: 844, y: 0, pageHeight: 844, image: 'data:image/jpeg;base64,aGVsbG8=' };
const valid = { summary: 'Hay un título cortado.', findings: [{ viewport: 'mobile', severity: 'major', category: 'readability', location: 'Portada', observation: 'El título queda cortado.', correction: 'Permite que el título pase a otra línea.' }] };
function setup() {
  const projects: any = { current: jest.fn().mockResolvedValue({ revision: 1 }), version: jest.fn().mockResolvedValue({ snapshot: { brief: {}, files: [{ path: 'index.html', content: '<h1>Store</h1>', encoding: 'utf8' }] } }) };
  const prisma: any = { storeAgentThread: { upsert: jest.fn().mockResolvedValue({ id: 'thread' }) }, storeAgentMessage: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) }, mediaAsset: { findMany: jest.fn() } };
  const usage: any = { record: jest.fn() };
  const config: any = { get: (key: string) => key.endsWith('apiKey') ? 'test-key' : true };
  const service = new SourceVisualReviewService(projects, config, prisma, usage, {} as any);
  return { service, projects, prisma, usage };
}
const input = { revision: 1, page: 'index.html', maxCredits: 10 };
beforeEach(() => { capture.mockReset().mockResolvedValue([shot]); });
afterEach(() => jest.restoreAllMocks());
it('returns an empty JSON object when no visual review is saved yet', async () => {
  const { service } = setup();
  await expect(service.latest('m', 's', 1, 'index.html')).resolves.toEqual({});
});
it('sends actual pixels, records usage, and persists only revision-scoped findings', async () => {
  const { service, prisma, usage } = setup();
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ status: 'completed', usage: { input_tokens: 3000, output_tokens: 300 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(valid) }] }] }) } as any);
  const result = await service.review('m', 's', input);
  expect(result.captures).toEqual([shot]);
  const request = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
  expect(request.input[0].content).toContainEqual({ type: 'input_image', image_url: shot.image, detail: 'high' });
  expect(JSON.stringify(prisma.storeAgentMessage.create.mock.calls)).not.toContain(shot.image);
  expect(usage.record.mock.calls[0][1]).toBe('visual-review');
  expect(result.findings).toEqual(valid.findings);
});
it('does not make a paid call when capture fails or the revision is stale', async () => {
  const { service, projects } = setup(); const fetchMock = jest.spyOn(globalThis, 'fetch');
  capture.mockRejectedValueOnce(new Error('missing browser'));
  await expect(service.review('m', 's', input)).rejects.toThrow('no se solicitó');
  projects.current.mockResolvedValue({ revision: 2 });
  await expect(service.review('m', 's', input)).rejects.toThrow('revisión actual');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('rejects non-vision providers before capture and does not silently switch provider', async () => {
  const { service } = setup();
  await expect(service.review('m', 's', { ...input, model: 'deepseek-v4-pro' })).rejects.toThrow('Vision');
  expect(capture).not.toHaveBeenCalled();
});
it('rejects malformed model findings and records failed usage', async () => {
  const { service, prisma, usage } = setup();
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ ...valid, findings: [{ ...valid.findings[0], severity: 'invented' }] }) }] }] }) } as any);
  await expect(service.review('m', 's', input)).rejects.toThrow('inválido');
  expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();
  expect(usage.record.mock.calls[0].at(-1)).toBe('FAILED');
});
it('does not attach a review to a newer revision', async () => {
  const { service, projects, prisma } = setup();
  projects.current.mockResolvedValueOnce({ revision: 1 }).mockResolvedValueOnce({ revision: 2 });
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(valid) }] }] }) } as any);
  await expect(service.review('m', 's', input)).rejects.toThrow('cambió durante');
  expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();
});
