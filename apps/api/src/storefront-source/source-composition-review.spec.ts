import { reviewSourceComposition, validateCompositionReview } from './source-composition-review';
import { SourceRequestBudget } from './source-request-budget';

describe('composition review boundary', () => {
  const finding = { id: 'image-wall', page: 'gallery.html', section: 'looks', severity: 'major', observation: 'Five equivalent photos without a shopping purpose.', correction: 'Group by the actual collection.' };
  it('rejects invented pages and unbounded or malformed findings', () => {
    expect(() => validateCompositionReview({ summary: 'Review', findings: [finding] }, ['index.html'])).toThrow();
    expect(() => validateCompositionReview({ summary: 'Review', findings: [{ ...finding, correction: '' }] }, ['gallery.html'])).toThrow();
    expect(() => validateCompositionReview({ summary: 'Review', findings: Array(4).fill(finding) }, ['gallery.html'])).toThrow();
    expect(validateCompositionReview({ summary: 'Review', findings: [finding] }, ['gallery.html']).findings).toEqual([finding]);
  });
  it('uses provided screenshots once, shared budget and recorded provider usage', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ summary: 'No visible defects', findings: [] }) }] }], usage: { input_tokens: 100, output_tokens: 50 } }) });
    const record = jest.fn();
    const budget = new SourceRequestBudget(100);
    const reserve = jest.spyOn(budget, 'reserve');
    await reviewSourceComposition({ snapshot: { schemaVersion: 1, brief: {} as any, files: [] }, captures: [{ page: 'index.html', width: 390, image: 'data:image/jpeg;base64,YQ==' }] }, { model: 'gpt-5.6-terra', provider: { endpoint: 'https://example.invalid/responses', apiKey: 'private' }, budget, fetchImpl, record });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ usage: expect.any(Object) }), expect.any(Number), 'COMPLETED');
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.input[0].content.filter((part: any) => part.type === 'input_image')).toHaveLength(1);
    expect(JSON.parse(body.input[0].content[0].text).preview).toEqual({ simulatedCheckout: true, catalogItemCount: 0 });
    expect(body.instructions).toContain('Vista previa');
    expect(body.instructions).toContain('not a production checkout defect');
  });
  it('records rejected responses without retrying or following image URLs', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ usage: { input_tokens: 20, output_tokens: 0 } }) });
    const record = jest.fn();
    const options = { model: 'gpt-5.6-terra' as const, provider: { endpoint: 'https://example.invalid/responses', apiKey: 'private' }, budget: new SourceRequestBudget(100), fetchImpl, record };
    const snapshot = { schemaVersion: 1 as const, brief: {} as any, files: [] };
    await expect(reviewSourceComposition({ snapshot, captures: [{ page: 'index.html', width: 390, image: 'https://external.invalid/photo' }] }, options)).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(reviewSourceComposition({ snapshot, captures: [{ page: 'index.html', width: 390, image: 'data:image/jpeg;base64,YQ==' }] }, options)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.any(Number), 'FAILED');
  });
  it('rejects incomplete provider output even when its JSON looks valid', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'incomplete', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ summary: 'Looks fine', findings: [] }) }] }] }) });
    await expect(reviewSourceComposition({ snapshot: { schemaVersion: 1, brief: {} as any, files: [] }, captures: [{ page: 'index.html', width: 390, image: 'data:image/jpeg;base64,YQ==' }] }, { model: 'gpt-5.6-terra', provider: { endpoint: 'https://example.invalid/responses', apiKey: 'private' }, budget: new SourceRequestBudget(100), fetchImpl })).rejects.toThrow('Incomplete response');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
