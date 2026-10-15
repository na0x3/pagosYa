import { loadStoreVoice } from './store-voice-load';

const SHEET = { version: 1, voice: 'Hablamos de tú.', specifics: [], texture: [], assumed: [], words: { order: 'Tu pedido' }, avoid: [] };

describe('loadStoreVoice (spec 2026-10-14)', () => {
  it("reads the latest revision's voice.json in PostgreSQL, read-only", async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ content: JSON.stringify(SHEET) }]) };
    expect(await loadStoreVoice(prisma as any, 's1')).toEqual(SHEET);
    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(query.text).toContain('ORDER BY v.revision DESC LIMIT 1');
    expect(query.text).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/i);
    expect(query.values).toEqual(['voice.json', 's1']);
  });

  it('is undefined for a store without a sheet, a broken one, or a failed read', async () => {
    expect(await loadStoreVoice({ $queryRaw: jest.fn().mockResolvedValue([{ content: null }]) } as any, 's1')).toBeUndefined();
    expect(await loadStoreVoice({ $queryRaw: jest.fn().mockResolvedValue([{ content: '{nope' }]) } as any, 's1')).toBeUndefined();
    expect(await loadStoreVoice({ $queryRaw: jest.fn().mockRejectedValue(new Error('down')) } as any, 's1')).toBeUndefined();
    expect(await loadStoreVoice({} as any, 's1')).toBeUndefined();
  });
});
