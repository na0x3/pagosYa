import { SourceFontsController } from './source-fonts.controller';

it('serves a catalogue font with CORS and refuses anything else', async () => {
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => { headers[k] = v; }, send: jest.fn() };
  await new SourceFontsController().font('outfit.ttf', res);
  expect(headers['Content-Type']).toBe('font/ttf');
  expect(headers['Access-Control-Allow-Origin']).toBe('*');
  expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
  await expect(new SourceFontsController().font('../../.env', res)).rejects.toThrow();
  await expect(new SourceFontsController().font('comic-sans.ttf', res)).rejects.toThrow();
});
