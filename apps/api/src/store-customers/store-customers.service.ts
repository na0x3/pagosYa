import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
const EMAIL = /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/;
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
    if (!name || name.length > 100) throw new BadRequestException('Escribe tu nombre (hasta 100 caracteres)');
    return name;
  }

  private link(slug: string, page: string, key: string, token: string) {
    const url = new URL(`/s/${encodeURIComponent(slug)}/${page}`, this.config.get<string>('app.checkoutOrigin') ?? 'http://localhost:5174');
    url.searchParams.set(key, token);
    return url.href;
  }

  private async send(to: string, subject: string, body: string) {
    try { await this.mail.send({ to, subject, body }); }
    catch (error) { this.logger.warn(`No se pudo enviar un correo de cliente: ${(error as Error).message}`); }
  }

  private profile(row: any): CustomerProfile {
    return { id: row.id, storeId: row.storeId, email: row.email, name: row.name, phone: row.phone ?? null, addresses: Array.isArray(row.addresses) ? row.addresses : [], emailVerifiedAt: row.emailVerifiedAt ?? null, createdAt: row.createdAt };
  }

  private async issueToken(customerId: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD', ttl: number) {
    await this.prisma.storeCustomerToken.updateMany({ where: { customerId, purpose, usedAt: null }, data: { usedAt: new Date() } });
    const token = newToken();
    await this.prisma.storeCustomerToken.create({ data: { customerId, purpose, hashedToken: digest(token), expiresAt: new Date(Date.now() + ttl) } });
    return token;
  }

  /** A token is consumed exactly once, even when two requests race: only the update that flips `usedAt` wins. */
  private async consumeToken(storeId: string, token: unknown, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
    if (typeof token !== 'string' || !token || token.length > 200) throw new BadRequestException(INVALID_LINK);
    const row = await this.prisma.storeCustomerToken.findUnique({ where: { hashedToken: digest(token) }, include: { customer: true } });
    if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt <= new Date() || row.customer.storeId !== storeId || row.customer.deletedAt) throw new BadRequestException(INVALID_LINK);
    const claimed = await this.prisma.storeCustomerToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
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
    const existing = await this.prisma.storeCustomer.findUnique({ where: { storeId_email: { storeId: store.id, email } } });
    if (existing && !existing.deletedAt && existing.emailVerifiedAt) return CUSTOMER_GENERIC_ANSWER;
    const customer = existing && !existing.deletedAt ? existing : await this.prisma.storeCustomer.create({ data: { storeId: store.id, email, name, hashedPassword } });
    const token = await this.issueToken(customer.id, 'VERIFY_EMAIL', VERIFY_MS);
    await this.send(email, `Confirma tu correo en ${store.name}`, `Hola ${customer.name},\n\nConfirma tu correo para activar tu cuenta en ${store.name}:\n${this.link(slug, 'acceso-ingresar.html', 'verify', token)}\n\nEl enlace expira en 24 horas. Si no creaste esta cuenta, ignora este mensaje.`);
    return CUSTOMER_GENERIC_ANSWER;
  }

  async verifyEmail(slug: string, token: unknown) {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    const customer = await this.consumeToken(store.id, token, 'VERIFY_EMAIL');
    await this.prisma.storeCustomer.update({ where: { id: customer.id }, data: { emailVerifiedAt: customer.emailVerifiedAt ?? new Date() } });
    return { ok: true };
  }

  async login(slug: string, emailInput: unknown, password: unknown) {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    const email = this.email(emailInput);
    const customer = email ? await this.prisma.storeCustomer.findUnique({ where: { storeId_email: { storeId: store.id, email } } }) : null;
    const matches = await argon2.verify(customer?.hashedPassword ?? await dummy(), typeof password === 'string' ? password.slice(0, 128) : '');
    if (!customer || customer.deletedAt || !matches) throw new UnauthorizedException(BAD_LOGIN);
    if (!customer.emailVerifiedAt) throw new UnauthorizedException('Confirma tu correo antes de ingresar');
    const token = newToken();
    const expiresAt = new Date(Date.now() + SESSION_MS);
    await this.prisma.storeCustomerSession.create({ data: { customerId: customer.id, hashedToken: digest(token), expiresAt } });
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
      const token = await this.issueToken(customer.id, 'RESET_PASSWORD', RESET_MS);
      await this.send(email, `Restablece tu contraseña en ${store.name}`, `Hola ${customer.name},\n\nUsa este enlace para elegir una contraseña nueva en ${store.name}:\n${this.link(slug, 'acceso-restablecer-contrasena.html', 'token', token)}\n\nEl enlace expira en 1 hora. Si no lo pediste, ignora este mensaje.`);
    }
    return CUSTOMER_GENERIC_ANSWER;
  }

  async resetPassword(slug: string, token: unknown, passwordInput: unknown) {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    const password = this.password(passwordInput);
    const customer = await this.consumeToken(store.id, token, 'RESET_PASSWORD');
    await this.prisma.storeCustomer.update({ where: { id: customer.id }, data: { hashedPassword: await argon2.hash(password) } });
    await this.prisma.storeCustomerSession.updateMany({ where: { customerId: customer.id, revokedAt: null }, data: { revokedAt: new Date() } });
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
    const addresses: Address[] = list.map(entry => {
      const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
      const address: Partial<Address> = {};
      for (const [key, max] of Object.entries(ADDRESS_LIMITS)) {
        const value = item[key] === undefined || item[key] === null ? '' : item[key];
        if (typeof value !== 'string' || value.length > max) throw new BadRequestException(`El campo ${key} de la dirección es demasiado largo o no es texto`);
        (address as any)[key] = value.trim();
      }
      const given = typeof item.id === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(item.id) ? item.id : randomUUID();
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
      where: { storeId: me.storeId, customerEmail: { equals: me.email, mode: 'insensitive' } },
      orderBy: { startedAt: 'desc' }, take: 50,
      select: { id: true, status: true, itemName: true, quantity: true, cadence: true, startedAt: true, nextBillingAt: true, canceledAt: true },
    });
  }

  /** Everything held about the customer, nothing that authenticates them. */
  async exportData(me: CustomerProfile) {
    return { email: me.email, name: me.name, phone: me.phone, addresses: me.addresses, verifiedAt: me.emailVerifiedAt, createdAt: me.createdAt, orders: await this.orders(me).catch(() => []), subscriptions: await this.subscriptions(me).catch(() => []) };
  }

  async deleteAccount(me: CustomerProfile, password: unknown) {
    const row = await this.prisma.storeCustomer.findUnique({ where: { storeId_email: { storeId: me.storeId, email: me.email } } });
    const matches = await argon2.verify(row?.hashedPassword ?? await dummy(), typeof password === 'string' ? password.slice(0, 128) : '');
    if (!row || !matches) throw new UnauthorizedException('La contraseña no es correcta');
    await this.prisma.storeCustomer.update({ where: { id: row.id }, data: { name: '', phone: null, addresses: [], email: `deleted-${row.id}@deleted.invalid`, hashedPassword: await argon2.hash(newToken()), emailVerifiedAt: null, deletedAt: new Date() } });
    await this.prisma.storeCustomerSession.updateMany({ where: { customerId: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.prisma.storeCustomerToken.deleteMany({ where: { customerId: row.id } });
    return { ok: true };
  }
}
