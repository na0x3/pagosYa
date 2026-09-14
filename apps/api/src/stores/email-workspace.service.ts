import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RetentionService } from './retention.service';
import { EMAIL_TEMPLATES, workspaceMail, type WorkspaceMail } from './email-workspace.config';
import { EmailDomainDto, EmailStaffDto, EmailTemplateDto } from './email-workspace.dto';
@Injectable()
export class EmailWorkspaceService {
    constructor(private readonly prisma: PrismaService, private readonly retention: RetentionService, private readonly config: ConfigService) { }
    async overview(merchantId: string, storeId: string) {
        const store = await this.retention.owner(merchantId, storeId), settings = await this.retention.settings(storeId), mail = workspaceMail(settings);
        const retentionKeys: Record<string, string> = { WELCOME: 'welcomeEnabled', RECOVERY: 'recoveryEnabled', REVIEW_REQUEST: 'reviewRequestsEnabled' };
        return { storeName: store.name, revision: settings.revision, emailConfigured: Boolean(this.config.get('app.email.resendApiKey')), domain: mail.domain || null, staff: mail.staff,
            templates: EMAIL_TEMPLATES.map(item => ({ ...item, ...mail.templates[item.id], enabled: retentionKeys[item.id] ? Boolean((settings as any)[retentionKeys[item.id]]) : Boolean(mail.templates[item.id]?.enabled), ...(item.id === 'WELCOME' ? { subject: settings.welcomeSubject, body: settings.welcomeBody } : {}), delayHours: item.id === 'RECOVERY' ? settings.recoveryHours : item.id === 'REVIEW_REQUEST' ? 24 : 0 })), logs: await this.logs(merchantId, storeId) };
    }
    private async mutate(merchantId: string, storeId: string, revision: number, fn: (mail: WorkspaceMail, settings: any) => void) {
        await this.retention.owner(merchantId, storeId);
        try {
            return await this.prisma.$transaction(async (tx) => {
                const row = await tx.storeRetention.findUnique({ where: { storeId } });
                if ((row?.revision || 0) !== revision)
                    throw new ConflictException('La configuración cambió. Actualiza antes de guardar.');
                const settings = { ...(row?.settings as any || {}) }, mail = workspaceMail(settings);
                fn(mail, settings);
                settings.emailWorkspace = mail;
                if (!row)
                    return tx.storeRetention.create({ data: { storeId, settings } });
                const changed = await tx.storeRetention.updateMany({ where: { storeId, revision }, data: { settings, revision: { increment: 1 } } });
                if (!changed.count)
                    throw new ConflictException('La configuración cambió. Actualiza antes de guardar.');
                return { saved: true };
            });
        }
        catch (error: any) {
            if (error.code === 'P2002')
                throw new ConflictException('La configuración cambió. Actualiza antes de guardar.');
            throw error;
        }
    }
    async template(merchantId: string, storeId: string, key: string, dto: EmailTemplateDto) {
        const definition = EMAIL_TEMPLATES.find(item => item.id === key);
        if (!definition)
            throw new BadRequestException('Plantilla desconocida.');
        if (dto.enabled && !definition.supported)
            throw new BadRequestException(definition.trigger);
        if (!dto.subject.trim() || !dto.body.trim())
            throw new BadRequestException('Completa el asunto y el mensaje.');
        return this.mutate(merchantId, storeId, dto.revision, (mail, settings) => {
            const prior = mail.templates[key];
            mail.templates[key] = { enabled: dto.enabled, subject: dto.subject.trim(), body: dto.body.trim(), enabledAt: dto.enabled ? prior?.enabled ? prior.enabledAt : new Date().toISOString() : prior?.enabledAt };
            mail.startedAt ||= new Date().toISOString();
            if (key === 'WELCOME') {
                settings.welcomeEnabled = dto.enabled;
                settings.welcomeSubject = dto.subject;
                settings.welcomeBody = dto.body;
            }
            if (key === 'RECOVERY')
                settings.recoveryEnabled = dto.enabled;
            if (key === 'REVIEW_REQUEST')
                settings.reviewRequestsEnabled = dto.enabled;
        });
    }
    async staff(merchantId: string, storeId: string, dto: EmailStaffDto) {
        const emails = dto.recipients.map(row => row.email.trim().toLowerCase());
        if (new Set(emails).size !== emails.length)
            throw new BadRequestException('No repitas destinatarios.');
        return this.mutate(merchantId, storeId, dto.revision, mail => { mail.staff = { enabled: dto.enabled, recipients: dto.recipients.map((row, i) => ({ ...row, email: emails[i] })), enabledAt: mail.staff.enabled && dto.enabled ? mail.staff.enabledAt : new Date().toISOString() }; mail.startedAt ||= new Date().toISOString(); });
    }
    private provider() { const key = this.config.get<string>('app.email.resendApiKey'); if (!key)
        throw new BadRequestException('El envío por correo todavía no está configurado.'); return new Resend(key); }
    async domain(merchantId: string, storeId: string, dto: EmailDomainDto) {
        await this.retention.owner(merchantId, storeId);
        const provider = this.provider();
        let createdId: string | undefined;
        try {
            await this.prisma.$transaction(async (tx) => {
                // Serialize both same-store and same-domain claims across API workers.
                await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`mail-store:${storeId}`}, 0))`;
                await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`mail-domain:${dto.name}`}, 0))`;
                const row = await tx.storeRetention.findUnique({ where: { storeId } });
                if ((row?.revision || 0) !== dto.revision)
                    throw new ConflictException('Actualiza la configuración antes de conectar el dominio.');
                const settings = { ...(row?.settings as any || {}) }, mail = workspaceMail(settings);
                if (mail.domain)
                    throw new BadRequestException('Esta tienda ya tiene un dominio de correo. Verifica sus registros.');
                const claimed = await tx.storeRetention.findFirst({ where: { settings: { path: ['emailWorkspace', 'domain', 'name'], equals: dto.name } } });
                if (claimed)
                    throw new ConflictException('Este dominio ya está conectado a otra tienda.');
                const result = await provider.domains.create({ name: dto.name });
                if (result.error || !result.data)
                    throw new BadRequestException(result.error?.message || 'No se pudo conectar el dominio.');
                createdId = result.data.id;
                mail.domain = { id: createdId, name: dto.name, senderName: dto.senderName, status: 'not_started', records: result.data.records || [] };
                settings.emailWorkspace = mail;
                if (row) {
                    const changed = await tx.storeRetention.updateMany({ where: { storeId, revision: dto.revision }, data: { settings, revision: { increment: 1 } } });
                    if (!changed.count)
                        throw new ConflictException('La configuración cambió. Actualiza antes de guardar.');
                }
                else
                    await tx.storeRetention.create({ data: { storeId, settings } });
            }, { timeout: 30000 });
        }
        catch (error) {
            // A failed database write must not leave a provider domain that blocks retry.
            if (createdId)
                await provider.domains.remove(createdId).catch(() => undefined);
            throw error;
        }
        return this.overview(merchantId, storeId);
    }
    async verify(merchantId: string, storeId: string, revision: number) {
        await this.retention.owner(merchantId, storeId);
        const settings = await this.retention.settings(storeId), domain = workspaceMail(settings).domain;
        if (settings.revision !== revision)
            throw new ConflictException('Actualiza la configuración.');
        if (!domain)
            throw new BadRequestException('Conecta un dominio primero.');
        const provider = this.provider();
        const verified = await provider.domains.verify(domain.id);
        if (verified.error)
            throw new BadRequestException(verified.error.message);
        const result = await provider.domains.get(domain.id);
        if (result.error || !result.data)
            throw new BadRequestException(result.error?.message || 'No se pudo verificar.');
        if (result.data.name !== domain.name)
            throw new BadRequestException('El dominio no coincide.');
        await this.mutate(merchantId, storeId, revision, mail => { mail.domain = { ...domain, status: result.data!.status, records: result.data!.records || [] }; });
        return this.overview(merchantId, storeId);
    }
    async logs(merchantId: string, storeId: string, before?: string) {
        await this.retention.owner(merchantId, storeId);
        const cursor = before ? await this.prisma.storeEmailDelivery.findFirst({ where: { id: before, storeId }, select: { id: true } }) : null;
        if (before && !cursor)
            throw new BadRequestException('Página de registros inválida.');
        const rows = await this.prisma.storeEmailDelivery.findMany({ where: { storeId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51, ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}), select: { id: true, email: true, kind: true, subject: true, status: true, attempts: true, createdAt: true, sentAt: true, lastError: true } });
        return { items: rows.slice(0, 50), nextBefore: rows.length > 50 ? rows[49].id : null };
    }
    private reporting = false;
    @Interval(60000)
    async weeklyReports() {
        if (this.reporting || !this.config.get('app.email.resendApiKey'))
            return;
        this.reporting = true;
        try {
            const programs = await this.prisma.storeRetention.findMany({ where: { settings: { path: ['emailWorkspace', 'staff', 'enabled'], equals: true } }, include: { store: true } });
            for (const program of programs) {
                if (program.store.status !== 'ACTIVE')
                    continue;
                const settings = program.settings as any, mail = workspaceMail(settings), now = new Date();
                const local = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone || 'America/La_Paz', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
                const part = (key: string) => local.find(item => item.type === key)?.value || '';
                if (part('weekday') !== 'Mon' || Number(part('hour')) < 8)
                    continue;
                const week = `${part('year')}-${part('month')}-${part('day')}`;
                const count = await this.prisma.storeOrder.count({ where: { storeId: program.storeId, createdAt: { gte: new Date(now.getTime() - 7 * 86400000) }, paymentIntent: { status: 'SUCCEEDED', livemode: true } } });
                for (const recipient of mail.staff.recipients.filter(item => item.events.includes('WEEKLY'))) {
                    const dedupeKey = `workspace:${program.storeId}:STAFF_WEEKLY:${week}:${recipient.email}`;
                    await this.prisma.storeEmailDelivery.upsert({ where: { dedupeKey }, create: { storeId: program.storeId, email: recipient.email, kind: 'STAFF_WEEKLY', sourceId: week, dedupeKey, subject: `Resumen semanal · ${program.store.name}`, body: `${count} pedidos con pago confirmado durante los últimos 7 días. Revisa ventas netas, productos y reembolsos en el panel de tu tienda.` }, update: {} });
                }
            }
        }
        finally {
            this.reporting = false;
        }
    }
}
