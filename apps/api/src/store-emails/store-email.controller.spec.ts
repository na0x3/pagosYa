import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { MerchantThrottlerGuard } from '../storefront-source/source-compile-budget';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_PROVIDER } from '../dashboard/tokens';
import { StoreEmailController } from './store-email.controller';
import { StoreEmailService } from './store-email.service';
import { EmailKitService } from './email-kit.service';
import { EmailKitStore } from './email-kit-store';

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
  const prisma = { store: { findFirst: jest.fn() } };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StoreEmailController],
      providers: [
        { provide: StoreEmailService, useValue: emails },
        { provide: EmailKitService, useValue: designer },
        { provide: EmailKitStore, useValue: kits },
        { provide: PrismaService, useValue: prisma },
        { provide: EMAIL_PROVIDER, useValue: mail },
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
    prisma.store.findFirst.mockResolvedValue({ name: 'Café Illimani', publishedSourceRevision: 7 });
    kits.active.mockResolvedValue(null);
    kits.candidate.mockResolvedValue(null);
    kits.hasPrevious.mockResolvedValue(false);
    kits.overrides.mockResolvedValue({});
    emails.sampleReceipt.mockImplementation(async (_s: string, storeName: string, type: string) => ({ storeName, type }));
    emails.renderReceipt.mockResolvedValue({ html: '<p>Orden: pi_SYNTH001</p>', subject: 'Recibo de tu compra en Café Illimani', repairs: [] });
    designer.design.mockResolvedValue({ status: 'saved', credits: 7, repairs: [] });
    kits.setOverride.mockResolvedValue({ value: 'Mío', repairs: [] });
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

  it('previews the active look by default, the candidate when asked, and 404s a missing candidate', async () => {
    await get('/preview?type=appointment_confirmed').expect(200);
    expect(emails.sampleReceipt).toHaveBeenCalledWith('store_1', 'Café Illimani', 'appointment_confirmed');
    expect(emails.renderReceipt).toHaveBeenLastCalledWith('store_1', expect.objectContaining({ type: 'appointment_confirmed' }));

    const candidate = { layout: 'L', blocks: 'B', copy: {} };
    kits.candidate.mockResolvedValue(candidate);
    await get('/preview?which=candidate').expect(200);
    expect(emails.renderReceipt).toHaveBeenLastCalledWith('store_1', expect.anything(), { kit: candidate });

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

  it('refuses a test-send from a secret-key session, which has no address', async () => {
    await post('/test-send', {}, KEY).expect(403);
    expect(mail.send).not.toHaveBeenCalled();
  });
});
