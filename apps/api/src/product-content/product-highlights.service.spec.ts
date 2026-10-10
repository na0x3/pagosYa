import { BadGatewayException } from '@nestjs/common';
import { ProductHighlightsService } from './product-highlights.service';
import { PRODUCT_HIGHLIGHT_ICONS } from '../payment-links/product-highlights';

const settings: Record<string, unknown> = { 'app.openAi.apiKey': 'server-key', 'app.openAi.inventoryModel': 'gpt-5.6-sol', 'app.openAi.enabled': true };
function make(reply?: unknown, ok = true, overrides: Record<string, unknown> = {}) {
  const prisma = { store: { findFirst: jest.fn().mockResolvedValue({ id: 's1', name: 'Punto' }) } } as any;
  const config = { get: jest.fn((key: string) => ({ ...settings, ...overrides })[key]) } as any;
  const usage = { record: jest.fn().mockResolvedValue(undefined) } as any;
  global.fetch = jest.fn().mockResolvedValue({
    ok, status: ok ? 200 : 502,
    json: jest.fn().mockResolvedValue(ok
      ? { output: [{ content: [{ type: 'output_text', text: JSON.stringify(reply) }] }], usage: { input_tokens: 10, output_tokens: 5 } }
      : { error: { message: 'upstream' } }),
  }) as unknown as typeof fetch;
  return { service: new ProductHighlightsService(prisma, config, usage), prisma, usage };
}
const product = { name: 'Lámpara de escritorio USB-C', description: 'Brazo ajustable y acabado mate.', specifications: [{ label: 'Conector', value: 'USB-C' }], tags: ['Aluminio'] };

describe('product highlight suggestions', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the local ChatGPT bridge when paid APIs are disabled, without falling back on failure', async () => {
    const overrides = { 'app.environment': 'development', 'app.chatgptPlan': { url: 'http://127.0.0.1:9999/responses', secret: 'local-bridge' }, 'app.openAi.apiKey': '', 'app.openAi.enabled': false };
    const { service } = make({ highlights: [{ icon: 'gear', label: 'Brazo ajustable', detail: null }] }, true, overrides);
    await expect(service.suggest('m1', 's1', product)).resolves.toEqual({ highlights: [{ icon: 'gear', label: 'Brazo ajustable' }] });
    expect(global.fetch).toHaveBeenCalledWith(overrides['app.chatgptPlan'].url, expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer local-bridge' }) }));
    const failed = make(null, false, overrides);
    await expect(failed.service.suggest('m1', 's1', product)).rejects.toBeInstanceOf(BadGatewayException);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(overrides['app.chatgptPlan'].url);
  });

  it('asks the configured model for icons from the shared list and returns approved-shaped rows', async () => {
    const { service, usage } = make({ highlights: [
      { icon: 'plug', label: 'USB-C', detail: 'Cualquier cargador' },
      { icon: 'lamp', label: 'Inventado' },
      { icon: 'gear', label: 'Brazo ajustable', detail: 'Acabado mate' },
    ] });
    const result = await service.suggest('m1', 's1', product);
    expect(result).toEqual({ highlights: [
      { icon: 'plug', label: 'USB-C', detail: 'Cualquier cargador' },
      { icon: 'gear', label: 'Brazo ajustable', detail: 'Acabado mate' },
    ] });
    const request = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(request.model).toBe('gpt-5.6-sol');
    expect(request.text.format.schema.properties.highlights.items.properties.icon.enum).toEqual([...PRODUCT_HIGHLIGHT_ICONS]);
    const prompt = JSON.stringify(request.input);
    expect(prompt).toContain('Lámpara de escritorio USB-C');
    expect(prompt).toContain('USB-C');
    expect(prompt).toMatch(/solo .*(hechos|datos)/i);
    expect(usage.record).toHaveBeenCalledWith('s1', 'product-highlights', 'gpt-5.6-sol', expect.anything(), expect.any(Number), 'ok');
  });

  it('never writes the suggestions and reports provider failures in Spanish', async () => {
    const { service, prisma } = make(null, false);
    await expect(service.suggest('m1', 's1', product)).rejects.toBeInstanceOf(BadGatewayException);
    await expect(service.suggest('m1', 's1', product)).rejects.toThrow(/YAPI|destacados/i);
    expect(prisma.store.findFirst).toHaveBeenCalled();
    expect((prisma as any).paymentLink).toBeUndefined();
  });

  it('drops a suggestion whose number or promise is not in the product facts', async () => {
    const { service } = make({ highlights: [
      { icon: 'plug', label: 'USB-C', detail: 'Carga en 2 horas' },
      { icon: 'shield', label: 'Garantía total', detail: null },
      { icon: 'gear', label: 'Brazo ajustable', detail: null },
    ] });
    await expect(service.suggest('m1', 's1', product)).resolves.toEqual({ highlights: [{ icon: 'gear', label: 'Brazo ajustable' }] });
  });

  it('keeps a number the product itself states', async () => {
    const { service } = make({ highlights: [{ icon: 'scoop', label: '20 g de proteína', detail: null }] });
    await expect(service.suggest('m1', 's1', { name: 'Café proteico', description: 'Cada porción trae 20 g de proteína.' }))
      .resolves.toEqual({ highlights: [{ icon: 'scoop', label: '20 g de proteína' }] });
  });

  it('returns nothing when the product has no facts to describe', async () => {
    const { service } = make({ highlights: [] });
    await expect(service.suggest('m1', 's1', { name: 'Producto' })).resolves.toEqual({ highlights: [] });
  });
});
