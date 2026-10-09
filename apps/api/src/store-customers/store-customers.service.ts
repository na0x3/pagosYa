import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { findActiveStoreBySlug } from '../stores/active-store';
import { EmailProvider } from '../dashboard/interfaces/email-provider.interface';
import { EMAIL_PROVIDER } from '../dashboard/tokens';

/** Shared by register and forgot-password so the answer never says whether an email has an account. */
export const CUSTOMER_GENERIC_ANSWER = { message: 'Si el correo es válido, te enviamos un enlace. Revisa tu bandeja de entrada.' } as const;

const SESSION_MS = 30 * 24 * 3_600_000;
const VERIFY_MS = 24 * 3_600_000;
const RESET_MS = 3_600_000;
const EMAIL = /^[^\s\x00-\x1f\x7f@<>"'`]+@[^\s\x00-\x1f\x7f@<>"'`]+\.[^\s\x00-\x1f\x7f@<>"'`]+$/;
const PHONE = /^\+?[0-9][0-9 ()-]{5,24}$/;
const INVALID_LINK = 'El enlace no es válido o expiró';
const BAD_LOGIN = 'Correo o contraseña incorrectos';

const digest = (token: string) => `sha256:${createHash('sha256').update(token).digest('hex')}`;
const newToken = () => randomBytes(32).toString('base64url');
/** Verified against when the email is unknown, so a login takes as long whether or not the account exists. */
let dummyHash: Promise<string> | undefined;
const dummy = () => (dummyHash ??= argon2.hash('pagosya-dummy-password-for-timing'));

export type CustomerProfile = { id: string; storeId: string; email: string; name: string; phone: string | null; addresses: any[]; emailVerifiedAt: Date | null; createdAt?: Date };
type Address = { id: string; label: string; recipient: string; phone: string; department: string; city: string; street: string; references: string };
const ADDRESS_LIMITS: Record<Exclude<keyof Address, 'id'>, number> = { label: 40, recipient: 100, phone: 30, department: 60, city: 60, street: 200, references: 300 };

/** A shopper's account in one store (spec 2026-09-30-store-customer-accounts-design). Every query is scoped to the store
 * resolved from the slug; nothing here is shared between stores. */
@Injectable()
export class StoreCustomersService {
  private readonly logger = new Logger(StoreCustomersService.name);

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, @Inject(EMAIL_PROVIDER) private readonly mail: EmailProvider) {}

  private email(input: unknown) {
    const email = typeof input === 'string' ? input.trim().toLowerCase() : '';
    return email.length <= 254 && EMAIL.test(email) ? email : '';
  }

  private password(input: unknown) {
    if (typeof input !== 'string' || input.length < 8 || input.length > 128) throw new BadRequestException('La contraseña debe tener entre 8 y 128 caracteres');
    return input;
  }

  private name(input: unknown) {
    const name = typeof input === 'string' ? input.trim() : '';
    if (!name || name.length > 100 || /[\x00-\x1f\x7f]/.test(name)) throw new BadRequestException('Escribe tu nombre (hasta 100 caracteres)');
    return name;
  }

  /** The store's own account page on its published address (spec 2026-10-08-store-built-in-account-pages). The token rides in
   * the fragment, which the trusted page reads and removes; the store frame never receives it. Old /cuenta links still work. */
  private link(slug: string, view: 'verificar' | 'restablecer', token: string) {
    const url = new URL(`/s/${encodeURIComponent(slug)}`, this.config.get<string>('app.checkoutOrigin') ?? 'http://localhost:5174');
    url.searchParams.set('source_page', view === 'verificar' ? 'acceso-ingresar.html' : 'acceso-restablecer-contrasena.html');
    url.hash = `${view}=${token}`;
    return url.href;
  }

  private async send(to: string, subject: string, body: string) {
    try { await this.mail.send({ to, subject, body }); }
    catch { this.logger.warn('No se pudo enviar un correo de cliente'); }
  }

  private profile(row: any): CustomerProfile {
    return { id: row.id, storeId: row.storeId, email: row.email, name: row.name, phone: row.phone ?? null, addresses: Array.isArray(row.addresses) ? row.addresses : [], emailVerifiedAt: row.emailVerifiedAt ?? null, createdAt: row.createdAt };
  }

  /** Serializable transactions bind verification to the credentials that issued its link and prevent
   * a concurrent login from escaping a password reset's session revocation. Hashing and mail stay outside. */
  private async credentials<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) {
        if (attempt >= 3 || !['P2034', 'P2002'].includes((error as { code?: string }).code ?? '')) throw error;
      }
    }
  }

  private async issueToken(customerId: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD', ttl: number, db: Prisma.TransactionClient = this.prisma) {
    await db.storeCustomerToken.updateMany({ where: { customerId, purpose, usedAt: null }, data: { usedAt: new Date() } });
    const token = newToken();
    await db.storeCustomerToken.create({ data: { customerId, purpose, hashedToken: digest(token), expiresAt: new Date(Date.now() + ttl) } });
    return token;
  }

  /** A token is consumed exactly once, even when two requests race: only the update that flips `usedAt` wins. */
  private async consumeToken(storeId: string, token: unknown, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD', db: Prisma.TransactionClient) {
    if (typeof token !== 'string' || !token || token.length > 200) throw new BadRequestException(INVALID_LINK);
    const row = await db.storeCustomerToken.findUnique({ where: { hashedToken: digest(token) }, include: { customer: true } });
    if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt <= new Date() || row.customer.storeId !== storeId || row.customer.deletedAt) throw new BadRequestException(INVALID_LINK);
    const claimed = await db.storeCustomerToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new BadRequestException(INVALID_LINK);
    return row.customer;
  }

  async register(slug: string, dto: { name: unknown; email: unknown; password: unknown }) {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    const name = this.name(dto.name), password = this.password(dto.password);
    const email = this.email(dto.email);
    if (!email) throw new BadRequestException('Escribe un correo válido');
    // Hashed before looking anything up, so a new address and an existing one cost the same time.
    const hashedPassword = await argon2.hash(password);
    const issued = await this.credentials(async db => {
      const existing = await db.storeCustomer.findUnique({ where: { storeId_email: { storeId: store.id, email } } });
      if (existing && !existing.deletedAt && existing.emailVerifiedAt) return null;
      // The newest registration owns the pending credentials; every earlier verification link is invalidated.
      const customer = existing && !existing.deletedAt
        ? await db.storeCustomer.update({ where: { id: existing.id }, data: { name, hashedPassword } })
        : await db.storeCustomer.create({ data: { storeId: store.id, email, name, hashedPassword } });
      return { customer, token: await this.issueToken(customer.id, 'VERIFY_EMAIL', VERIFY_MS, db) };
    });
    if (issued) await this.send(email, `Confirma tu correo en ${store.name}`, `Hola ${issued.customer.name},\n\nConfirma tu correo para activar tu cuenta en ${store.name}:\n${this.link(slug, 'verificar', issued.token)}\n\nEl enlace expira en 24 horas. Si no creaste esta cuenta, ignora este mensaje.`);
    return CUSTOMER_GENERIC_ANSWER;
  }

  async verifyEmail(slug: string, token: unknown) {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    await this.credentials(async db => {
      const customer = await this.consumeToken(store.id, token, 'VERIFY_EMAIL', db);
      await db.storeCustomer.update({ where: { id: customer.id }, data: { emailVerifiedAt: customer.emailVerifiedAt ?? new Date() } });
    });
    return { ok: true };
  }

  async login(slug: string, emailInput: unknown, password: unknown) {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    const email = this.email(emailInput);
    const customer = email ? await this.prisma.storeCustomer.findUnique({ where: { storeId_email: { storeId: store.id, email } } }) : null;
    const matches = await argon2.verify(customer?.hashedPassword ?? await dummy(), typeof password === 'string' ? password.slice(0, 128) : '');
    if (!customer || customer.deletedAt || !matches || typeof password !== 'string' || password.length < 8 || password.length > 128) throw new UnauthorizedException(BAD_LOGIN);
    if (!customer.emailVerifiedAt) throw new UnauthorizedException('Confirma tu correo antes de ingresar');
    const token = newToken();
    const expiresAt = new Date(Date.now() + SESSION_MS);
    const checkedHash = customer.hashedPassword;
    await this.credentials(async db => {
      const current = await db.storeCustomer.findUnique({ where: { id: customer.id } });
      if (!current || current.deletedAt || !current.emailVerifiedAt || current.hashedPassword !== checkedHash) throw new UnauthorizedException(BAD_LOGIN);
      await db.storeCustomerSession.create({ data: { customerId: customer.id, hashedToken: digest(token), expiresAt } });
    });
    return { token, expiresAt, customer: this.profile(customer) };
  }

  async authenticate(slug: string, token: unknown): Promise<CustomerProfile> {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    if (typeof token !== 'string' || !token || token.length > 200) throw new UnauthorizedException('Inicia sesión para continuar');
    const session = await this.prisma.storeCustomerSession.findUnique({ where: { hashedToken: digest(token) }, include: { customer: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.customer.storeId !== store.id || session.customer.deletedAt) throw new UnauthorizedException('Inicia sesión para continuar');
    return this.profile(session.customer);
  }

  async logout(slug: string, token: unknown) {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    if (typeof token === 'string' && token && token.length <= 200) {
      const session = await this.prisma.storeCustomerSession.findUnique({ where: { hashedToken: digest(token) }, include: { customer: true } });
      if (session && session.customer.storeId === store.id) await this.prisma.storeCustomerSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return { ok: true };
  }

  async forgotPassword(slug: string, emailInput: unknown) {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    const email = this.email(emailInput);
    const customer = email ? await this.prisma.storeCustomer.findUnique({ where: { storeId_email: { storeId: store.id, email } } }) : null;
    if (customer && !customer.deletedAt && customer.emailVerifiedAt) {
      const token = await this.credentials(db => this.issueToken(customer.id, 'RESET_PASSWORD', RESET_MS, db));
      await this.send(email, `Restablece tu contraseña en ${store.name}`, `Hola ${customer.name},\n\nUsa este enlace para elegir una contraseña nueva en ${store.name}:\n${this.link(slug, 'restablecer', token)}\n\nEl enlace expira en 1 hora. Si no lo pediste, ignora este mensaje.`);
    }
    return CUSTOMER_GENERIC_ANSWER;
  }

  async resetPassword(slug: string, token: unknown, passwordInput: unknown) {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    const password = this.password(passwordInput);
    const hashedPassword = await argon2.hash(password);
    await this.credentials(async db => {
      const customer = await this.consumeToken(store.id, token, 'RESET_PASSWORD', db);
      await db.storeCustomer.update({ where: { id: customer.id }, data: { hashedPassword } });
      await db.storeCustomerSession.updateMany({ where: { customerId: customer.id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    return { ok: true };
  }

  async updateProfile(me: CustomerProfile, dto: { name: unknown; phone?: unknown }) {
    const name = this.name(dto.name);
    const phone = dto.phone === undefined || dto.phone === null || dto.phone === '' ? null : typeof dto.phone === 'string' && PHONE.test(dto.phone.trim()) ? dto.phone.trim() : undefined;
    if (phone === undefined) throw new BadRequestException('Escribe un teléfono válido, con código de país');
    return this.profile(await this.prisma.storeCustomer.update({ where: { id: me.id }, data: { name, phone } }));
  }

  async replaceAddresses(me: CustomerProfile, list: unknown) {
    if (!Array.isArray(list) || list.length > 10) throw new BadRequestException('Puedes guardar hasta 10 direcciones');
    const ids = new Set<string>();
    const addresses: Address[] = list.map(entry => {
      const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
      const address: Partial<Address> = {};
      for (const [key, max] of Object.entries(ADDRESS_LIMITS)) {
        const value = item[key] === undefined || item[key] === null ? '' : item[key];
        if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new BadRequestException(`El campo ${key} de la dirección es demasiado largo o no es texto`);
        (address as any)[key] = value.trim();
      }
      if (!address.recipient || !address.department || !address.city || !address.street) throw new BadRequestException('Completa destinatario, departamento, ciudad y dirección');
      if (address.phone && !PHONE.test(address.phone)) throw new BadRequestException('Escribe un teléfono válido para la dirección');
      const given = typeof item.id === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(item.id) ? item.id : randomUUID();
      if (ids.has(given)) throw new BadRequestException('Cada dirección debe tener un identificador diferente');
      ids.add(given);
      return { id: given, ...address } as Address;
    });
    await this.prisma.storeCustomer.update({ where: { id: me.id }, data: { addresses } });
    return addresses;
  }

  async orders(me: CustomerProfile) {
    if (!me.emailVerifiedAt) throw new UnauthorizedException('Confirma tu correo para ver tus pedidos');
    return this.prisma.storeOrder.findMany({
      where: { storeId: me.storeId, paymentIntent: { customerEmail: { equals: me.email, mode: 'insensitive' } } },
      orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, status: true, amount: true, currency: true, items: true, fulfillmentMethod: true, createdAt: true },
    });
  }

  async subscriptions(me: CustomerProfile) {
    if (!me.emailVerifiedAt) throw new UnauthorizedException('Confirma tu correo para ver tus suscripciones');
    return this.prisma.customerSubscription.findMany({
      where: { storeId: me.storeId, membershipPeriodId: null, customerEmail: { equals: me.email, mode: 'insensitive' } },
      orderBy: { startedAt: 'desc' }, take: 50,
      select: { id: true, status: true, itemName: true, quantity: true, cadence: true, startedAt: true, nextBillingAt: true, canceledAt: true },
    });
  }

  /** Everything held about the customer, nothing that authenticates them. */
  async exportData(me: CustomerProfile) {
    return { email: me.email, name: me.name, phone: me.phone, addresses: me.addresses, verifiedAt: me.emailVerifiedAt, createdAt: me.createdAt, orders: await this.orders(me), subscriptions: await this.subscriptions(me) };
  }

  async deleteAccount(me: CustomerProfile, password: unknown) {
    const row = await this.prisma.storeCustomer.findUnique({ where: { storeId_email: { storeId: me.storeId, email: me.email } } });
    const matches = await argon2.verify(row?.hashedPassword ?? await dummy(), typeof password === 'string' ? password.slice(0, 128) : '');
    if (!row || row.deletedAt || !matches || typeof password !== 'string' || password.length < 8 || password.length > 128) throw new UnauthorizedException('La contraseña no es correcta');
    const hashedPassword = await argon2.hash(newToken());
    const checkedHash = row.hashedPassword;
    await this.credentials(async db => {
      const current = await db.storeCustomer.findUnique({ where: { id: row.id } });
      if (!current || current.deletedAt || current.hashedPassword !== checkedHash) throw new UnauthorizedException('La contraseña no es correcta');
      await db.storeCustomer.update({ where: { id: row.id }, data: { name: '', phone: null, addresses: [], email: `deleted-${row.id}@deleted.invalid`, hashedPassword, emailVerifiedAt: null, deletedAt: new Date() } });
      await db.storeCustomerSession.updateMany({ where: { customerId: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await db.storeCustomerToken.deleteMany({ where: { customerId: row.id } });
    });
    return { ok: true };
  }
}
