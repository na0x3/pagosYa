import { BadRequestException } from '@nestjs/common';
import { EmailKitStore } from './email-kit-store';

function harness() {
  const rows: any[] = [];
  const overrides = new Map<string, any>();
  const key = (s: string, t: string, f: string) => `${s}|${t}|${f}`;
  const prisma: any = {
    storeEmailKit: {
      findUnique: jest.fn(async ({ where }) => rows.find(r => r.storeId === where.storeId_status.storeId && r.status === where.storeId_status.status) ?? null),
      deleteMany: jest.fn(async ({ where }) => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].storeId === where.storeId && rows[i].status === where.status) rows.splice(i, 1); return {}; }),
      create: jest.fn(async ({ data }) => { const row = { id: `k${rows.length + 1}`, createdAt: new Date(), ...data }; rows.push(row); return row; }),
      update: jest.fn(async ({ where, data }) => {
        const row = rows.find(r => r.id === where.id);
        if (data.status && rows.some(r => r !== row && r.storeId === row.storeId && r.status === data.status)) throw new Error('unique (storeId, status) violated');
        return Object.assign(row, data);
      }),
    },
    storeEmailCopyOverride: {
      findMany: jest.fn(async ({ where }) => [...overrides.values()].filter(o => o.storeId === where.storeId && o.emailType === where.emailType)),
      upsert: jest.fn(async ({ where, create, update }) => {
        const k = key(where.storeId_emailType_field.storeId, where.storeId_emailType_field.emailType, where.storeId_emailType_field.field);
        overrides.set(k, overrides.has(k) ? { ...overrides.get(k), ...update } : create); return overrides.get(k);
      }),
      deleteMany: jest.fn(async ({ where }) => { overrides.delete(key(where.storeId, where.emailType, where.field)); return {}; }),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  return { store: new EmailKitStore(prisma), prisma };
}
const kit = (layout: string) => ({ mode: 'twin' as const, layout, blocks: '', copy: {}, designedFromRevision: 3, credits: 4, model: 'gpt-5.6-terra', repairs: [] });

describe('EmailKitStore', () => {
  it('the first design becomes active; later ones wait as a candidate', async () => {
    const { store } = harness();
    await store.saveActive('s', kit('A'));
    await store.saveActive('s', kit('B'));
    expect((await store.active('s'))!.layout).toBe('A');
    expect((await store.candidate('s'))!.layout).toBe('B');
  });

  it('accepting keeps the old look as previous, and revert swaps them back', async () => {
    const { store } = harness();
    await store.saveActive('s', kit('A'));
    await store.saveCandidate('s', kit('B'));
    await store.accept('s');
    expect((await store.active('s'))!.layout).toBe('B');
    expect(await store.hasPrevious('s')).toBe(true);
    await store.revert('s');
    expect((await store.active('s'))!.layout).toBe('A');
    expect((await store.candidate('s'))).toBeNull();
  });

  it('revert with a pending candidate drops the candidate and never breaks the one-per-status rule', async () => {
    const { store } = harness();
    await store.saveActive('s', kit('A'));
    await store.saveCandidate('s', kit('B'));
    await store.accept('s');
    await store.saveCandidate('s', kit('C'));
    await store.revert('s');
    expect((await store.active('s'))!.layout).toBe('A');
    expect(await store.candidate('s')).toBeNull();
  });

  it('discarding a candidate leaves the active look alone', async () => {
    const { store } = harness();
    await store.saveActive('s', kit('A'));
    await store.saveCandidate('s', kit('B'));
    await store.discard('s');
    expect(await store.candidate('s')).toBeNull();
    expect((await store.active('s'))!.layout).toBe('A');
  });

  it('a merchant edit is cleaned, kept apart from the kit, and survives a redesign', async () => {
    const { store } = harness();
    await store.saveActive('s', kit('A'));
    await store.setOverride('s', 'order_confirmation', 'headline', '¡Gracias por elegirnos!');
    await store.saveCandidate('s', kit('B'));
    await store.accept('s');
    expect(await store.overrides('s', 'order_confirmation')).toEqual({ headline: '¡Gracias por elegirnos!' });
    await store.clearOverride('s', 'order_confirmation', 'headline');
    expect(await store.overrides('s', 'order_confirmation')).toEqual({});
  });

  it('asks for text when an edit is empty, rather than blaming facts', async () => {
    const { store } = harness();
    await expect(store.setOverride('s', 'order_confirmation', 'headline', '   ')).rejects.toThrow(/^Escribe un texto\.$/);
  });

  it('a first design that loses the race to another saves as a candidate instead of failing', async () => {
    const { store, prisma } = harness() as any;
    prisma.storeEmailKit.create.mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    await store.saveActive('s', kit('B'));
    expect((await store.candidate('s'))!.layout).toBe('B');
  });

  it('refuses an edit that is only a fact', async () => {
    const { store } = harness();
    await expect(store.setOverride('s', 'order_confirmation', 'headline', 'Bs 150,00')).rejects.toBeInstanceOf(BadRequestException);
  });
});
