import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { MerchantThrottlerGuard } from '../storefront-source/source-compile-budget';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_PROVIDER } from '../dashboard/tokens';
import { ConfigService } from '@nestjs/config';
import { StoreEmailController } from './store-email.controller';
import { StoreEmailService } from './store-email.service';
import { EmailKitService } from './email-kit.service';
import { EmailKitStore } from './email-kit-store';
import { EmailContentStore } from './email-content-store';

/**
 * The guard is replaced rather than disabled: every route reads or changes a store's
 * look, and test-send puts a real message on the wire, so the 401, the ownership
 * boundary and the session-only address are all exercised for real.
 */
const SESSION = 'Bearer dash_session';
const KEY = 'Bearer sk_test_key';
const BASE = '/v1/stores/store_1/source-project/emails';

describe('Ajustes › Correos routes', () => {
  let app: INestApplication;
  const emails = {
    renderReceipt: jest.fn(),
    sampleReceipt: jest.fn(),
  };
  const designer = { design: jest.fn() };
  const kits = {
    active: jest.fn(), candidate: jest.fn(), hasPrevious: jest.fn(),
    accept: jest.fn(), discard: jest.fn(), revert: jest.fn(),
    overrides: jest.fn(), setOverride: jest.fn(), clearOverride: jest.fn(),
  };
  const mail = { send: jest.fn() };
  const content = { get: jest.fn(), set: jest.fn(), clear: jest.fn(), setSwitch: jest.fn() };
  const prisma = { store: { findFirst: jest.fn() }, promoCode: { findMany: jest.fn() }, paymentLink: { findMany: jest.fn() } };
  const config = { get: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StoreEmailController],
      providers: [
        { provide: StoreEmailService, useValue: emails },
        { provide: EmailKitService, useValue: designer },
        { provide: EmailKitStore, useValue: kits },
        { provide: EmailContentStore, useValue: content },
        { provide: PrismaService, useValue: prisma },
        { provide: EMAIL_PROVIDER, useValue: mail },
        { provide: ConfigService, useValue: config },
      ],
    })
      .overrideGuard(MerchantAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          const header = req.headers['authorization'];
          if (header === SESSION) { req.merchant = { id: 'm1' }; req.merchantUser = { id: 'mu1', email: 'dueña@tienda.test' }; return true; }
          // A secret key authenticates a merchant but carries no dashboard user.
          if (header === KEY) { req.merchant = { id: 'm1' }; return true; }
          throw new UnauthorizedException('Missing credentials');
        },
      })
      .overrideGuard(MerchantThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue(undefined);
    prisma.store.findFirst.mockResolvedValue({ name: 'Café Illimani', publishedSourceRevision: 7 });
    kits.active.mockResolvedValue(null);
    kits.candidate.mockResolvedValue(null);
    kits.hasPrevious.mockResolvedValue(false);
    kits.overrides.mockResolvedValue({});
    emails.sampleReceipt.mockImplementation(async (_s: string, storeName: string, type: string) => ({ storeName, type }));
    emails.renderReceipt.mockResolvedValue({ html: '<p>Orden: pi_SYNTH001</p>', subject: 'Recibo de tu compra en Café Illimani', repairs: [] });
    designer.design.mockResolvedValue({ status: 'saved', credits: 7, repairs: [] });
    kits.setOverride.mockResolvedValue({ value: 'Mío', repairs: [] });
    content.get.mockResolvedValue({});
    content.set.mockResolvedValue({ announcement: { text: 'Envío gratis' } });
    content.clear.mockResolvedValue({});
    content.setSwitch.mockResolvedValue({ emails: { order_confirmation: { promo: false } } });
    prisma.promoCode.findMany.mockResolvedValue([]);
    prisma.paymentLink.findMany.mockResolvedValue([]);
  });

  const get = (path: string, auth = SESSION) => request(app.getHttpServer()).get(BASE + path).set('authorization', auth);
  const post = (path: string, body: object = {}, auth = SESSION) => request(app.getHttpServer()).post(BASE + path).set('authorization', auth).send(body);

  it('404s a store the merchant does not own, on every route, and looks it up scoped to the merchant', async () => {
    prisma.store.findFirst.mockResolvedValue(null);
    const server = app.getHttpServer();
    await get('').expect(404);
    await get('/preview').expect(404);
    await post('/design').expect(404);
    await post('/candidate/accept').expect(404);
    await post('/candidate/discard').expect(404);
    await post('/revert').expect(404);
    await get('/copy/order_confirmation').expect(404);
    await request(server).put(`${BASE}/copy/order_confirmation/headline`).set('authorization', SESSION).send({ value: 'x' }).expect(404);
    await request(server).delete(`${BASE}/copy/order_confirmation/headline`).set('authorization', SESSION).expect(404);
    await post('/test-send').expect(404);
    expect(prisma.store.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'store_1', merchantId: 'm1' } }));
    expect(designer.design).not.toHaveBeenCalled();
    expect(kits.accept).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated request', async () => {
    await request(app.getHttpServer()).get(BASE).expect(401);
  });

  it('reports no look, and the two receipt types', async () => {
    const res = await get('').expect(200);
    expect(res.body).toEqual({ kit: 'none', candidate: false, previous: false, siteChanged: false, available: true, maxCredits: 25,
      types: [{ type: 'order_confirmation', label: 'Confirmación de compra', group: 'Compras' }, { type: 'appointment_confirmed', label: 'Cita confirmada', group: 'Compras' }] });
  });

  it('when the kit tables are missing, status and wording still answer, marked unavailable, instead of a 500', async () => {
    kits.active.mockRejectedValue(new Error('relation "StoreEmailKit" does not exist'));
    kits.candidate.mockRejectedValue(new Error('relation "StoreEmailKit" does not exist'));
    kits.hasPrevious.mockRejectedValue(new Error('relation "StoreEmailKit" does not exist'));
    kits.overrides.mockRejectedValue(new Error('relation "StoreEmailCopyOverride" does not exist'));
    const status = (await get('').expect(200)).body;
    expect(status).toMatchObject({ kit: 'none', available: false, maxCredits: 25 });
    expect(status.types).toHaveLength(2);
    const copy = (await get('/copy/order_confirmation').expect(200)).body;
    expect(copy.available).toBe(false);
    expect(copy.fields.find((f: any) => f.field === 'subject')).toMatchObject({ value: 'Recibo de tu compra en {tienda}', edited: false });
  });

  it('reports siteChanged when the site was published after the look was designed', async () => {
    kits.active.mockResolvedValue({ designedFromRevision: 4 });
    expect((await get('').expect(200)).body).toMatchObject({ kit: 'active', siteChanged: true });
    kits.active.mockResolvedValue({ designedFromRevision: 7 });
    expect((await get('').expect(200)).body).toMatchObject({ kit: 'active', siteChanged: false });
  });

  // Previews load in the merchant's browser: without the public https base (local dev, no tunnel) their images
  // come from the address the browser reached this API on, so icons and photos show instead of broken boxes.
  it('previews images from the address the dashboard reached the API on when no public base is set', async () => {
    await get('/preview').expect(200);
    expect(emails.renderReceipt).toHaveBeenLastCalledWith('store_1', expect.anything(), { assetBase: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/) });
  });
  it('previews images from the public https base when one is set', async () => {
    config.get.mockImplementation((key: string) => (key === 'app.publicAssetBaseUrl' ? 'https://api.pagosya.bo' : undefined));
    await get('/preview').expect(200);
    expect(emails.renderReceipt).toHaveBeenLastCalledWith('store_1', expect.anything(), { assetBase: 'https://api.pagosya.bo' });
  });

  it('previews the active look by default, the candidate when asked, and 404s a missing candidate', async () => {
    await get('/preview?type=appointment_confirmed').expect(200);
    expect(emails.sampleReceipt).toHaveBeenCalledWith('store_1', 'Café Illimani', 'appointment_confirmed');
    expect(emails.renderReceipt).toHaveBeenLastCalledWith('store_1', expect.objectContaining({ type: 'appointment_confirmed' }), { assetBase: expect.any(String) });

    const candidate = { layout: 'L', blocks: 'B', copy: {} };
    kits.candidate.mockResolvedValue(candidate);
    await get('/preview?which=candidate').expect(200);
    expect(emails.renderReceipt).toHaveBeenLastCalledWith('store_1', expect.anything(), { kit: candidate, assetBase: expect.any(String) });

    kits.candidate.mockResolvedValue(null);
    await get('/preview?which=candidate').expect(404);
  });

  it('designs as the first look when there is none, as a candidate otherwise', async () => {
    const res = await post('/design').expect(201);
    expect(res.body).toEqual({ status: 'saved', credits: 7, repairs: [] });
    expect(designer.design).toHaveBeenLastCalledWith('store_1', 'twin', 'first');
    kits.active.mockResolvedValue({ id: 'k1' });
    await post('/design', { mode: 'bold' }).expect(201);
    expect(designer.design).toHaveBeenLastCalledWith('store_1', 'bold', 'candidate');
  });

  it('accepts, discards and reverts the store looks', async () => {
    await post('/candidate/accept').expect(201);
    await post('/candidate/discard').expect(201);
    await post('/revert').expect(201);
    expect(kits.accept).toHaveBeenCalledWith('store_1');
    expect(kits.discard).toHaveBeenCalledWith('store_1');
    expect(kits.revert).toHaveBeenCalledWith('store_1');
  });

  it('rejects an unknown email type or field with 400', async () => {
    await get('/copy/welcome_v9').expect(400);
    await get('/preview?type=welcome_v9').expect(400);
    await request(app.getHttpServer()).put(`${BASE}/copy/order_confirmation/colour`).set('authorization', SESSION).send({ value: 'x' }).expect(400);
    await request(app.getHttpServer()).put(`${BASE}/copy/order_confirmation/headline`).set('authorization', SESSION).send({ value: 42 }).expect(400);
    expect(kits.setOverride).not.toHaveBeenCalled();
  });

  it('shows wording with placeholders intact and marks edited fields', async () => {
    kits.overrides.mockResolvedValue({ headline: 'Mío' });
    const res = await get('/copy/order_confirmation').expect(200);
    expect(res.body.fields).toEqual(expect.arrayContaining([
      { field: 'headline', max: 80, value: 'Mío', edited: true },
      { field: 'subject', max: 90, value: 'Recibo de tu compra en {tienda}', edited: false },
      { field: 'intro', max: 400, value: 'Hola {cliente}, tu pago fue confirmado. Este es el detalle de tu pedido.', edited: false },
    ]));
  });

  it('saves a wording edit through the store, and clears one', async () => {
    const res = await request(app.getHttpServer()).put(`${BASE}/copy/order_confirmation/headline`).set('authorization', SESSION).send({ value: 'Mío' }).expect(200);
    expect(res.body).toEqual({ value: 'Mío', repairs: [] });
    expect(kits.setOverride).toHaveBeenCalledWith('store_1', 'order_confirmation', 'headline', 'Mío');
    await request(app.getHttpServer()).delete(`${BASE}/copy/order_confirmation/headline`).set('authorization', SESSION).expect(200);
    expect(kits.clearOverride).toHaveBeenCalledWith('store_1', 'order_confirmation', 'headline');
  });

  it('test-sends the selected email to the session address only', async () => {
    await post('/test-send', { type: 'appointment_confirmed', to: 'someone@else.test' }).expect(201);
    expect(emails.sampleReceipt).toHaveBeenCalledWith('store_1', 'Café Illimani', 'appointment_confirmed');
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'dueña@tienda.test', subject: 'Prueba · Recibo de tu compra en Café Illimani', html: '<p>Orden: pi_SYNTH001</p>' }));
  });

  it('test-sends the new design while one waits for review, so it can be checked in Gmail first', async () => {
    const candidate = { id: 'k2', layout: 'L', blocks: 'B', copy: {} };
    kits.candidate.mockResolvedValue(candidate);
    await post('/test-send', { type: 'order_confirmation' }).expect(201);
    expect(emails.renderReceipt).toHaveBeenLastCalledWith('store_1', expect.anything(), { kit: candidate });
  });

  it("shows the waiting design's wording, the one the preview shows", async () => {
    kits.active.mockResolvedValue({ copy: { order_confirmation: { headline: 'Del diseño actual' } } });
    kits.candidate.mockResolvedValue({ copy: { order_confirmation: { headline: 'Del diseño nuevo' } } });
    const res = await get('/copy/order_confirmation').expect(200);
    expect(res.body.fields.find((f: any) => f.field === 'headline').value).toBe('Del diseño nuevo');
  });

  it('sends to the local test address when one is configured, still only for a signed-in dashboard user', async () => {
    config.get.mockImplementation((key: string) => (key === 'app.emailTestTo' ? 'dueña@gmail.com' : undefined));
    await post('/test-send', { type: 'order_confirmation' }).expect(201);
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'dueña@gmail.com' }));
    mail.send.mockClear();
    await post('/test-send', {}, KEY).expect(403);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('refuses a test-send from a secret-key session, which has no address', async () => {
    await post('/test-send', {}, KEY).expect(403);
    expect(mail.send).not.toHaveBeenCalled();
  });

  describe('the content of the emails', () => {
    const put = (path: string, body: object) => request(app.getHttpServer()).put(BASE + path).set('authorization', SESSION).send(body);
    const del = (path: string) => request(app.getHttpServer()).delete(BASE + path).set('authorization', SESSION);

    it('404s every content route for a store the merchant does not own', async () => {
      prisma.store.findFirst.mockResolvedValue(null);
      await get('/content').expect(404);
      await put('/content/announcement', { text: 'x' }).expect(404);
      await del('/content/announcement').expect(404);
      await put('/content/emails/order_confirmation/promo', { on: false }).expect(404);
      expect(content.set).not.toHaveBeenCalled();
      expect(content.setSwitch).not.toHaveBeenCalled();
    });

    it('returns the content, every active code with its shared flag, the store photos and the default wording', async () => {
      prisma.store.findFirst.mockResolvedValue({ name: 'Café Illimani', publishedSourceRevision: 7, bannerUrl: '/v1/uploads/banner.webp' });
      content.get.mockResolvedValue({ promo: { promoCodeId: 'p2' } });
      prisma.promoCode.findMany.mockResolvedValue([
        { id: 'p1', code: 'PRIVADO', discountType: 'FIXED', discountValue: 2000, showInEmails: false },
        { id: 'p2', code: 'VUELVE10', discountType: 'PERCENT', discountValue: 10, showInEmails: true },
      ]);
      prisma.paymentLink.findMany.mockResolvedValue([
        { name: 'Café', imageUrls: ['/v1/uploads/cafe.webp'] }, { name: 'Taza', imageUrls: ['https://cdn.example/taza.jpg'] }, { name: 'Molinillo', imageUrls: [] },
      ]);
      const res = await get('/content').expect(200);
      expect(res.body).toMatchObject({ available: true, content: { promo: { promoCodeId: 'p2' } },
        promos: [{ id: 'p1', code: 'PRIVADO', discount: 'Bs 20 en tu próxima compra', shared: false }, { id: 'p2', code: 'VUELVE10', discount: '10% en tu próxima compra', shared: true }],
        photos: [{ url: '/v1/uploads/banner.webp', label: 'Portada de tu tienda' }, { url: '/v1/uploads/cafe.webp', label: 'Café' }] });
      expect(res.body.defaults).toEqual(expect.objectContaining({ announcement: 'Gracias por comprar en {tienda}.', note: expect.any(String), storyTitle: 'Sobre {tienda}' }));
      expect(prisma.promoCode.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: 'store_1', isActive: true } }));
    });

    it('reports the content as unavailable while its table is missing', async () => {
      content.get.mockRejectedValue(new Error('relation "StoreEmailContent" does not exist'));
      expect((await get('/content').expect(200)).body).toMatchObject({ available: false, content: {}, promos: [], photos: [] });
    });

    it('saves, clears and switches through the content store', async () => {
      expect((await put('/content/announcement', { text: 'Envío gratis' }).expect(200)).body).toEqual({ announcement: { text: 'Envío gratis' } });
      expect(content.set).toHaveBeenCalledWith('store_1', 'announcement', { text: 'Envío gratis' });
      await del('/content/note').expect(200);
      expect(content.clear).toHaveBeenCalledWith('store_1', 'note');
      await put('/content/emails/order_confirmation/promo', { on: false }).expect(200);
      expect(content.setSwitch).toHaveBeenCalledWith('store_1', 'order_confirmation', 'promo', false);
    });

    it("passes the store's refusal through, and refuses unknown items, emails and switches", async () => {
      const { BadRequestException } = await import('@nestjs/common');
      content.set.mockRejectedValue(new BadRequestException('Elige una foto de tu tienda.'));
      expect((await put('/content/heroImage', { url: 'https://evil.example/x.png' }).expect(400)).body.message).toBe('Elige una foto de tu tienda.');
      await put('/content/nope', {}).expect(400);
      await del('/content/nope').expect(400);
      await put('/content/emails/nope/promo', { on: false }).expect(400);
      await put('/content/emails/order_confirmation/note', { on: false }).expect(400);
      await put('/content/emails/order_confirmation/promo', { on: 'no' }).expect(400);
      expect(content.setSwitch).not.toHaveBeenCalled();
    });
  });
});
