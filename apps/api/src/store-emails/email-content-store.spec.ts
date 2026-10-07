import { BadRequestException } from '@nestjs/common';
import { EmailContentStore } from './email-content-store';

function harness() {
  const rows = new Map<string, unknown>();
  const prisma: any = { storeEmailContent: {
    findUnique: jest.fn(async ({ where }: any) => (rows.has(where.storeId) ? { storeId: where.storeId, data: rows.get(where.storeId) } : null)),
    upsert: jest.fn(async ({ where, create, update }: any) => { rows.set(where.storeId, rows.has(where.storeId) ? update.data : create.data); }),
  } };
  return new EmailContentStore(prisma);
}

describe('EmailContentStore', () => {
  let store: EmailContentStore;
  beforeEach(() => { store = harness(); });

  it('a store that saved nothing has no content', async () => {
    expect(await store.get('s')).toEqual({});
  });

  it('keeps the merchant announcement cleaned, and refuses one that is only a fact', async () => {
    await store.set('s', 'announcement', { text: '  Envío gratis\ntodo octubre ' });
    expect((await store.get('s')).announcement).toEqual({ text: 'Envío gratis todo octubre' });
    await expect(store.set('s', 'announcement', { text: 'Bs 300' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(store.set('s', 'announcement', { text: '   ' })).rejects.toThrow('Escribe un texto.');
  });

  it('lets the merchant turn the announcement and the story off', async () => {
    await store.set('s', 'announcement', { off: true });
    await store.set('s', 'story', { off: true });
    expect(await store.get('s')).toEqual({ announcement: { off: true }, story: { off: true } });
  });

  it('refuses a photo that is not one of the store uploads', async () => {
    await expect(store.set('s', 'heroImage', { url: 'https://evil.example/x.png' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(store.set('s', 'story', { title: 'Sobre', text: 'Hecho a mano', imageUrl: '/v1/uploads/../secret' })).rejects.toBeInstanceOf(BadRequestException);
    await store.set('s', 'heroImage', { url: '/v1/uploads/hero.webp' });
    expect((await store.get('s')).heroImage).toEqual({ url: '/v1/uploads/hero.webp' });
  });

  it('clears one item without touching the others, and keeps per-email switches', async () => {
    await store.set('s', 'note', { text: 'Gracias por elegirnos' });
    await store.setSwitch('s', 'appointment_confirmed', 'promo', false);
    await store.clear('s', 'note');
    expect(await store.get('s')).toEqual({ emails: { appointment_confirmed: { promo: false } } });
  });

  it('caps the story', async () => {
    await store.set('s', 'story', { title: 't'.repeat(70), text: 'Hecho a mano', imageUrl: null });
    expect(((await store.get('s')).story as any).title).toHaveLength(60);
  });

  it('accepts a chosen promo or none, and a recommendations switch, and nothing else', async () => {
    await store.set('s', 'promo', { promoCodeId: 'p1' });
    await store.set('s', 'recommendations', { on: false });
    expect(await store.get('s')).toEqual({ promo: { promoCodeId: 'p1' }, recommendations: { on: false } });
    await store.set('s', 'promo', { promoCodeId: null });
    expect((await store.get('s')).promo).toEqual({ promoCodeId: null });
    await expect(store.set('s', 'promo', { promoCodeId: 3 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(store.set('s', 'recommendations', { on: 'yes' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(store.set('s', 'note', { off: true })).rejects.toBeInstanceOf(BadRequestException);
    await expect(store.set('s', 'nope' as any, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ignores stored junk instead of failing a receipt', async () => {
    const prisma: any = { storeEmailContent: { findUnique: jest.fn(async () => ({ data: ['not', 'an', 'object'] })) } };
    expect(await new EmailContentStore(prisma).get('s')).toEqual({});
  });
});
