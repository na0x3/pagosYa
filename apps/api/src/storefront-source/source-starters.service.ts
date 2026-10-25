import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { templateManifest } from '@pagosya/store-templates';
import { PrismaService } from '../prisma/prisma.service';
import type { SourceMessageInput } from './dto/send-source-message.dto';
import { MASTER_TEMPLATE_ID } from './source-master';
import { isFashionStore } from './source-master-fashion';
import { SourceChatJobsService } from './source-chat-jobs.service';
import { SourceChatService } from './source-chat.service';
import type { SourceProjectSnapshot } from './source-project';
import { SourceProjectsService } from './source-projects.service';
import { BUNDLED_PHOTO } from './source-product-photos';
import { buildStarters, rankStarters } from './source-starter-pick';
import { readMasterState } from './source-templates';

/** A revision a template or a starter saved (spec 2026-10-24: «Estilo: …»; a Plantilla or a preset: «Plantilla: …»). */
const BUILD_LABEL = /^(Estilo|Plantilla):/;
/** Shown once the merchant has changed the store on their own. */
const OWN_CHANGES = 'Tu tienda ya tiene cambios tuyos; pídele a YAPI el estilo que quieres.';

/** «Probar otro estilo» (spec 2026-10-24 §2): while a new store is still on its first build, the merchant can rebuild it from
 *  one of the two next-best starters. YAPI's own follow-up keeps the store eligible; the merchant's own change ends it. */
@Injectable()
export class SourceStartersService {
  constructor(private readonly prisma: PrismaService, private readonly projects: SourceProjectsService, private readonly chat: SourceChatService,
    private readonly jobs: SourceChatJobsService, private readonly config: ConfigService) {}

  private on() { return this.config.get<boolean>('app.yapiStarters') === true; }

  /** The store's words, as the first build's pick read them (the store, its walkthrough and its products). */
  private async business(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { name: true, onboarding: true } });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    const onboarding = (store.onboarding ?? {}) as { what?: string; story?: string };
    const products = (await this.prisma.paymentLink.findMany({ where: { storeId }, select: { name: true }, take: 30 })).map(product => product.name);
    return { text: [store.name, onboarding.what, onboarding.story, ...products].filter(Boolean).join('\n'),
      fashion: isFashionStore({ storeName: store.name, what: onboarding.what ?? '', products }) };
  }

  /** The build the store is still on, or null once anything but a build or YAPI's follow-up of one was saved. */
  private async firstBuild(merchantId: string, storeId: string) {
    const versions = await this.prisma.storeSourceVersion.findMany({ where: { storeId }, orderBy: { revision: 'asc' }, take: 60, select: { revision: true, label: true } });
    if (!versions.length || !BUILD_LABEL.test(versions[0].label)) return null;
    const jobs = await this.prisma.storeSourceChatJob.findMany({ where: { storeId, merchantId }, select: { input: true, lastCommittedRevision: true } });
    // A follow-up job (personalTouch) saves the revisions after the one it started from.
    const followed = (revision: number) => jobs.some(job => {
      const input = job.input as unknown as SourceMessageInput | null;
      return input?.personalTouch === true && job.lastCommittedRevision !== null && input.revision < revision && revision <= job.lastCommittedRevision;
    });
    if (versions.some(version => !BUILD_LABEL.test(version.label) && !followed(version.revision))) return null;
    const base = [...versions].reverse().find(version => BUILD_LABEL.test(version.label))!;
    const snapshot = (await this.projects.version(merchantId, storeId, base.revision)).snapshot as unknown as SourceProjectSnapshot;
    return { revision: base.revision, starterId: (snapshot.brief as { starterId?: string } | undefined)?.starterId ?? MASTER_TEMPLATE_ID, snapshot };
  }

  async alternatives(merchantId: string, storeId: string): Promise<{ current: string | null; alternatives: Array<{ id: string; name: string; description: string; preview: string }> }> {
    const none = { current: null, alternatives: [] };
    if (!this.on()) return none;
    const { text, fashion } = await this.business(merchantId, storeId);
    const build = await this.firstBuild(merchantId, storeId);
    if (!build) return none;
    // Esencial is the fallback and has no gallery picture; the cards offer finished stores only.
    const ids = rankStarters({ text, fashion, starters: buildStarters(), recent: [] }).filter(id => id !== build.starterId && id !== MASTER_TEMPLATE_ID).slice(0, 2);
    return { current: build.starterId, alternatives: ids.flatMap(id => {
      const manifest = templateManifest(id);
      return manifest?.starter ? [{ id, name: manifest.name, description: manifest.starter.description, preview: `plantillas/${id}.webp` }] : [];
    }) };
  }

  async swap(merchantId: string, storeId: string, starterId: string, revision: number): Promise<{ revision: number }> {
    const starters = this.on() ? buildStarters() : [];
    const starter = starters.find(entry => entry.id === starterId);
    if (!starter) throw new NotFoundException('Ese estilo no existe.');
    await this.business(merchantId, storeId);
    const build = await this.firstBuild(merchantId, storeId);
    if (!build) throw new ConflictException(OWN_CHANGES);
    if (build.starterId === starter.id) throw new ConflictException('Tu tienda ya usa ese estilo.');
    if ((await this.projects.current(merchantId, storeId)).revision !== revision) throw new ConflictException('El proyecto cambió. Recarga antes de probar otro estilo.');
    // YAPI's follow-up of the old build is stopped (its result would land on the old look); the merchant's own request is not.
    const active = await this.prisma.storeSourceChatJob.findMany({ where: { storeId, merchantId, status: { in: ['QUEUED', 'RUNNING'] } }, select: { id: true, input: true } });
    if (active.some(job => (job.input as unknown as SourceMessageInput | null)?.personalTouch !== true)) throw new ConflictException('YAPI está trabajando en un pedido tuyo; prueba otro estilo cuando termine.');
    for (const job of active) await this.jobs.cancel(merchantId, storeId, job.id);
    const current = (await this.projects.current(merchantId, storeId)).revision;
    // Master to master keeps the words YAPI wrote; a copy-slots store, or a swap into one, has its words written again.
    const fromMaster = (starters.find(entry => entry.id === build.starterId)?.kind ?? 'master') === 'master';
    const state = starter.kind === 'master' && fromMaster ? readMasterState(build.snapshot.files) : undefined;
    const words = state?.copy ? { copy: state.copy, ...(state.sections ? { sections: state.sections } : {}) } : undefined;
    // The build's hero and story photos as they were (live check 2026-10-24: a swap pointed the new hero at /v1/uploads, which later
    // design checks cannot load): a bundled photo travels with its file, an upload is bundled again, «none» stays none.
    const bundled = (path: string | undefined) => path && BUNDLED_PHOTO.test(path) ? build.snapshot.files.find(file => file.path === path) : undefined;
    const files = [bundled(state?.photos.hero), bundled(state?.photos.story)].filter((file): file is NonNullable<typeof file> => Boolean(file));
    const photos = words ? { ...(state?.photos.hero !== undefined ? { heroPhoto: state.photos.hero } : {}), ...(state?.photos.story !== undefined ? { storyPhoto: state.photos.story } : {}), files } : undefined;
    const saved = await this.chat.rebuildFromStarter(merchantId, storeId, starter, current, words, photos);
    // The follow-up the build had (personal touch or redesign) runs again on the new look.
    const followUp = (await this.prisma.storeSourceChatJob.findMany({ where: { storeId, merchantId }, orderBy: { createdAt: 'desc' }, select: { input: true } }))
      .map(job => job.input as unknown as (SourceMessageInput & { merchantRequest?: unknown }) | null)
      .find(input => input?.personalTouch === true && input.revision === build.revision);
    if (followUp) {
      const { merchantRequest: _merchantRequest, ...input } = followUp;
      await this.jobs.create(merchantId, storeId, { ...input, revision: saved.revision, requestId: randomUUID() });
    }
    const name = templateManifest(starter.id)?.name ?? starter.id;
    const thread = await this.prisma.storeAgentThread.upsert({ where: { storeId }, create: { storeId }, update: { updatedAt: new Date() } });
    await this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'ASSISTANT',
      content: `Probé el estilo «${name}» con tus productos y tus textos.${followUp ? ' Ahora le doy los últimos toques; aparecerán en unos minutos.' : ''} La versión anterior sigue en el historial.`,
      metadata: { sourceRevision: saved.revision, label: saved.label } as Prisma.InputJsonValue } });
    return { revision: saved.revision };
  }
}
