import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { PlansService } from '../plans/plans.service';
import { AiUsageService } from '../ai-usage/ai-usage.service';
import { brandCall } from '../storefront-source/brand/brand-model-call';
import { sourceProvider } from '../storefront-source/source-provider';
import { POPUP_MOMENTS, isPopupMoment, renderedSteps, validateFlow, type PopupFlow, type PopupMoment } from './popup-flow';
import { cleanStepHtml } from './popup-html';
import { scopePopupCss, unscopePopupCss } from './popup-css';
import { popupFingerprint, varietyProblem } from './popup-fingerprint';
import { checkFlowRender, measureFlow, type FlowContext, type FlowRenderInput, type FlowStepMeasure } from './popup-flow-render';
import { POPUP_DESIGN_SCHEMA, POPUP_FAMILY_SCHEMA, popupDesignPrompt, popupFamilyPrompt } from './popup-design-prompt';
import { popupChatRequest } from './popup-chat';
import { join } from 'node:path';
import sharp from 'sharp';
import { productCutout } from '../storefront-source/source-photo-cutout';

type Created = 'yapi' | 'merchant-chat' | 'batch';
type Candidate = { flow: PopupFlow; steps: Record<string, string>; css: string; launcher: string | null; composition: string; fingerprint: string };
const designId = () => `c${Array.from(randomBytes(24), byte => '0123456789abcdefghijklmnopqrstuvwxyz'[byte % 36]).join('')}`;
const clamp = (value: number) => Math.max(5, Math.min(30, Math.round(value)));
const MOMENT_NAMES: Record<PopupMoment, string> = { welcome: 'de bienvenida', rescue: 'del carrito', interest: 'de interés', return: 'de regreso' };

/** Popups 2.0 (spec 2026-11-18 §5–6, §8): YAPI writes a store's popup; it is cleaned, played in a real browser and compared with the
 *  popups other stores already have, retried once with what failed, and saved LIVE (the store points at it) or FAILED (the store
 *  keeps the popup it had). */
@Injectable()
export class PopupDesignService {
  /** The model call and the browser check, replaceable in tests. */
  call: (prompt: string, storeId: string, kind?: 'design' | 'family') => Promise<unknown> = (prompt, storeId, kind) => this.modelCall(prompt, storeId, kind);
  measure: (input: FlowRenderInput) => Promise<FlowStepMeasure[] | null> = input => measureFlow(input);
  /** The local background removal (downloads its 44 MB model once), replaceable in tests. */
  cut: (bytes: Buffer, model: string) => Promise<{ cut: Buffer | null }> = (bytes, model) => productCutout(bytes, model);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly uploads: UploadsService,
    @Optional() private readonly plans?: PlansService,
    @Optional() private readonly usage?: AiUsageService,
  ) {}

  private async modelCall(prompt: string, storeId: string, kind: 'design' | 'family' = 'design') {
    const model = this.config.get<string>('app.yapiPopupModel') ?? 'gpt-5.6-sol';
    const provider = sourceProvider(this.config, model);
    const { json } = await brandCall({ endpoint: provider.endpoint, apiKey: provider.apiKey, model, record: async (body, ms, ok) => { await this.usage?.record(storeId, 'popup-design', model, body, ms, ok ? 'COMPLETED' : 'FAILED'); } },
      { text: prompt, schemaName: kind === 'family' ? 'popup_family' : 'popup_design', schema: kind === 'family' ? POPUP_FAMILY_SCHEMA : POPUP_DESIGN_SCHEMA, maxOutputTokens: kind === 'family' ? 40_000 : 16_000 });
    return json;
  }

  private async store(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, name: true, slug: true, merchantId: true, onboarding: true } });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    return store;
  }
  private async settings(storeId: string) {
    return ((await this.prisma.storeRetention.findUnique({ where: { storeId } }))?.settings ?? {}) as Record<string, unknown>;
  }
  /** Writes over the settings version it read (another save in between → read again), so no other setting is lost. */
  private async point(storeId: string, given: Record<string, unknown> | ((settings: Record<string, unknown>) => Record<string, unknown>)) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await this.prisma.storeRetention.findUnique({ where: { storeId } });
      const patch = typeof given === 'function' ? given((row?.settings ?? {}) as Record<string, unknown>) : given;
      if (!row) {
        const created = await this.prisma.storeRetention.create({ data: { storeId, settings: patch as never } }).then(() => true, () => false);
        if (created) return; continue;
      }
      const settings = { ...((row.settings ?? {}) as Record<string, unknown>), ...patch };
      const { count } = await this.prisma.storeRetention.updateMany({ where: { storeId, updatedAt: row.updatedAt }, data: { settings: settings as never } });
      if (count) return;
    }
    throw new ConflictException('Otra pestaña guardó a la vez; vuelve a intentarlo.');
  }

  /** YAPI's answer made safe and complete, or the list of what is wrong (in the words YAPI gets back). */
  private assemble(raw: any, id: string, products: string[], taken: Array<{ fingerprint: string; composition: string }>, layout?: 'full' | 'card', moment: PopupMoment = 'welcome'): Candidate | { problems: string[] } {
    const problems: string[] = [];
    const flowResult = validateFlow(raw?.flow, products, moment);
    if ('problems' in flowResult) return { problems: flowResult.problems };
    const given = new Map<string, string>((Array.isArray(raw?.steps) ? raw.steps : []).map((step: any) => [String(step?.id), String(step?.html ?? '')]));
    const steps: Record<string, string> = {};
    for (const step of renderedSteps(flowResult.flow)) {
      const cleaned = cleanStepHtml(given.get(step.id) ?? '', step.kind);
      if ('problem' in cleaned) problems.push(`paso ${step.id}: ${cleaned.problem}`); else steps[step.id] = cleaned.html;
      if (layout === 'full' && 'html' in cleaned && !/^<[a-z0-9]+\b[^>]*\sdata-full\b/i.test(cleaned.html.trim())) problems.push(`paso ${step.id}: falta data-full en el elemento exterior (formato pantalla completa).`);
    }
    const scoped = scopePopupCss(String(raw?.css ?? ''), id);
    if ('problem' in scoped) problems.push(scoped.problem);
    const composition = String(raw?.composition ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (!composition) problems.push('Falta composition (una línea que nombre tu composición).');
    if (problems.length || 'problem' in scoped) return { problems };
    const fingerprint = popupFingerprint(steps, scoped.css);
    const repeated = varietyProblem({ fingerprint, composition }, taken);
    if (repeated) return { problems: [repeated] };
    const launcher = String(raw?.launcher ?? '').trim();
    const cleanLauncher = launcher ? cleanStepHtml(launcher.slice(0, 2000), 'launcher') : null;
    return { flow: flowResult.flow, steps, css: scoped.css, launcher: cleanLauncher && 'html' in cleanLauncher ? cleanLauncher.html : null, composition, fingerprint };
  }

  /** What every design run starts from: the store, its settings, up to 12 products with their photos, and the cut-outs. */
  private async gather(merchantId: string, storeId: string, createdBy: Created) {
    const store = await this.store(merchantId, storeId);
    if (createdBy !== 'batch') await this.plans?.assertCredits(storeId);
    const settings = await this.settings(storeId);
    const capture = settings.popupDesignCapture === 'email' ? 'email' as const : 'whatsapp' as const;
    const percent = clamp(Number(settings.popupDesignPercent) || 10);
    const rows = await this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, select: { id: true, name: true, amount: true, imageUrls: true, categoryId: true }, take: 12 });
    const products = rows.map(row => ({ id: row.id, name: row.name, price: `Bs ${(row.amount / 100).toLocaleString('es-BO')}`, photo: (row.imageUrls ?? []).find(url => url.startsWith('/v1/uploads/')) ?? '' }));
    const brief = (store.onboarding as { brandBrief?: { identity?: { palette?: Record<string, string>; voice?: string }; research?: { niche?: string } } } | null)?.brandBrief;
    const photos: FlowRenderInput['photos'] = {};
    for (const photo of [...new Set(products.map(p => p.photo).filter(Boolean))]) {
      const bytes = await this.uploads.getBuffer(photo.split('/').at(-1)!).catch(() => null);
      if (bytes) photos[photo] = { bytes, contentType: /\.png$/i.test(photo) ? 'image/png' : /\.webp$/i.test(photo) ? 'image/webp' : 'image/jpeg' };
    }
    const cutouts = await this.cutouts(products, photos);
    return { store, settings, capture, percent, rows, products, brief, photos, cutouts };
  }

  async design(merchantId: string, storeId: string, options: { createdBy: Created; request?: string; signal?: AbortSignal; layout?: 'full' | 'card' }) {
    const { store, capture, percent, rows, products, brief, photos, cutouts } = await this.gather(merchantId, storeId, options.createdBy);
    const taken = await this.prisma.storePopupDesign.findMany({ where: { status: 'LIVE', moment: 'welcome', storeId: { not: storeId } }, orderBy: { createdAt: 'desc' }, take: 30, select: { fingerprint: true, composition: true } });
    const id = designId();
    let problems: string[] = [];
    let candidate: Candidate | null = null;
    let measures: FlowStepMeasure[] | null = null;
    let previous: { flow: unknown; steps: Record<string, string>; css: string } | undefined;
    // Three tries: the second and third repair the previous design with what failed (live 2026-11-18, Fishwife).
    for (let attempt = 0; attempt < 3 && !candidate; attempt++) {
      options.signal?.throwIfAborted();
      const raw = await this.call(popupDesignPrompt({ storeName: store.name, sector: brief?.research?.niche ?? '', palette: brief?.identity?.palette ?? {}, fonts: [], voice: brief?.identity?.voice ?? '',
        photos: Object.keys(photos).filter(path => !cutouts.some(cut => cut.url === path)), cutouts, products, capture, percent, taken: taken.map(t => t.composition), request: options.request, retryProblems: problems.length ? problems : undefined, previous: problems.length ? previous : undefined, layout: options.layout }), storeId)
        .catch((error: unknown) => ({ failed: String((error as Error)?.message ?? error).slice(0, 300) }));
      // The model's own words reach the chat and the batch log (live 2026-11-18: an exhausted ChatGPT allowance read as «no answer»).
      if (raw && typeof raw === 'object' && 'failed' in raw) {
        problems = [`El modelo no respondió: ${(raw as { failed: string }).failed}`];
        if (/usage_limit|quota|rate.?limit|insufficient|ServiceUnavailable|no está configurad/i.test(problems[0])) break;
        continue;
      }
      const built = raw ? this.assemble(raw, id, products.map(p => p.id), taken, options.layout) : { problems: ['No llegó una respuesta del modelo.'] };
      if (raw && typeof raw === 'object') {
        const answer = raw as { flow?: unknown; steps?: Array<{ id?: string; html?: string }>; css?: string };
        previous = { flow: answer.flow, steps: Object.fromEntries((Array.isArray(answer.steps) ? answer.steps : []).map(step => [String(step?.id), String(step?.html ?? '')])), css: String(answer.css ?? '') };
      }
      if ('problems' in built) { problems = built.problems; continue; }
      measures = await this.measure({ storeName: store.name, design: { id, flow: built.flow, steps: built.steps, css: built.css, capture, percent }, items: rows.map(r => ({ id: r.id, name: r.name, price: r.amount, imageUrls: r.imageUrls, categoryId: r.categoryId })), photos });
      problems = measures ? checkFlowRender(measures) : ['No se pudo abrir el navegador de prueba.'];
      if (!problems.length) candidate = built;
    }
    const saved = await this.saveMoment(storeId, { id, family: null, moment: 'welcome', createdBy: options.createdBy, request: options.request, capture, percent, candidate, problems, measures });
    if (saved.status !== 'LIVE') return { design: { id, version: saved.version, status: 'FAILED' as const }, problems };
    await this.point(storeId, { popupDesignId: id, popupDesignOff: null });
    return { design: { id, version: saved.version, status: 'LIVE' as const, composition: saved.composition }, problems: [] };
  }

  /** A design version saved under the per-store lock: FAILED kept for diagnosis, or LIVE retiring the moment's previous LIVE one. */
  private async saveMoment(storeId: string, s: { id: string; family: string | null; moment: PopupMoment; createdBy: Created; request?: string; capture: string; percent: number; candidate: Candidate | null; problems: string[]; measures: FlowStepMeasure[] | null }) {
    const previews = [];
    for (const m of (s.measures ?? []).filter(m => m.size.width < 500 && m.screenshot.length)) previews.push({ stepId: m.stepId, url: (await this.uploads.saveBuffer(m.screenshot, 'image/jpeg')).url });
    // One store, one writer at a time: the version is numbered and the LIVE one switched under a per-store lock.
    const nextVersion = async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`popup-design:${storeId}`}::text))`;
      return ((await tx.storePopupDesign.aggregate({ where: { storeId }, _max: { version: true } }))._max.version ?? 0) + 1;
    };
    const base = { id: s.id, storeId, moment: s.moment, family: s.family, createdBy: s.createdBy, request: s.request ?? null, capture: s.capture, percent: s.percent, checks: { problems: s.problems } as never, previews: (s.candidate ? previews : null) as never };
    const candidate = s.candidate;
    const version = await this.prisma.$transaction(async tx => {
      const version = await nextVersion(tx);
      if (!candidate) { await tx.storePopupDesign.create({ data: { ...base, version, status: 'FAILED', flow: [] as never, steps: {} as never, css: '', composition: '', fingerprint: '' } }); return version; }
      await tx.storePopupDesign.updateMany({ where: { storeId, moment: s.moment, status: 'LIVE', id: { not: s.id } }, data: { status: 'RETIRED' } });
      await tx.storePopupDesign.create({ data: { ...base, version, status: 'LIVE', flow: candidate.flow as never, steps: candidate.steps as never, css: candidate.css, launcher: candidate.launcher, composition: candidate.composition, fingerprint: candidate.fingerprint } });
      return version;
    });
    return candidate
      ? { moment: s.moment, id: s.id, version, status: 'LIVE' as const, composition: candidate.composition, problems: [] as string[] }
      : { moment: s.moment, id: s.id, version, status: 'FAILED' as const, problems: s.problems };
  }

  /** The moment's context for the browser check (spec 2026-11-21 §6): two cart lines, a viewed product, a favourite. */
  private checkContext(moment: PopupMoment, rows: Array<{ id: string; name: string; amount: number; imageUrls: string[]; categoryId?: string | null }>): FlowContext {
    const photo = (r: { imageUrls: string[] }) => (r.imageUrls ?? []).find(url => url.startsWith('/v1/uploads/')) ?? '';
    if (moment === 'rescue') return { moment, cart: rows.slice(0, 2).map(r => ({ id: r.id, name: r.name, price: r.amount, quantity: 1, photo: photo(r) })) };
    if (moment === 'interest' && rows[0]) return { moment, product: { id: rows[0].id, name: rows[0].name, categoryId: rows[0].categoryId ?? '' } };
    if (moment === 'return' && rows[0]) return { moment, contact: true, favourite: rows[0].id };
    return { moment };
  }

  /** Part 2 (spec 2026-11-21 §6): the store's missing moments written in one call, each checked and repaired alone. */
  async designFamily(merchantId: string, storeId: string, options: { createdBy: Created; moments?: PopupMoment[]; request?: string; signal?: AbortSignal }) {
    const g = await this.gather(merchantId, storeId, options.createdBy);
    const welcomeId = typeof g.settings.popupDesignId === 'string' ? g.settings.popupDesignId : '';
    const anchorRow = welcomeId ? await this.prisma.storePopupDesign.findFirst({ where: { id: welcomeId, storeId, status: 'LIVE' } }) : null;
    const moments = (options.moments ?? (anchorRow ? ['rescue', 'interest', 'return'] as PopupMoment[] : [...POPUP_MOMENTS])).filter(isPopupMoment);
    const taken: Partial<Record<PopupMoment, Array<{ fingerprint: string; composition: string }>>> = {};
    for (const moment of moments) taken[moment] = await this.prisma.storePopupDesign.findMany({ where: { status: 'LIVE', moment, storeId: { not: storeId } }, orderBy: { createdAt: 'desc' }, take: 30, select: { fingerprint: true, composition: true } });
    const base = { storeName: g.store.name, sector: g.brief?.research?.niche ?? '', palette: g.brief?.identity?.palette ?? {}, fonts: [] as string[], voice: g.brief?.identity?.voice ?? '',
      photos: Object.keys(g.photos).filter(path => !g.cutouts.some(cut => cut.url === path)), cutouts: g.cutouts, products: g.products, capture: g.capture, percent: g.percent, taken: [] as string[], request: options.request };
    // The welcome's stored sheet is scoped to the welcome: given back plain, so each new popup scopes it as its own.
    const anchor = anchorRow ? { css: unscopePopupCss(anchorRow.css, anchorRow.id), steps: anchorRow.steps as Record<string, string> } : undefined;
    options.signal?.throwIfAborted();
    const raw = await this.call(popupFamilyPrompt({ ...base, moments, anchor, takenByMoment: Object.fromEntries(moments.map(m => [m, (taken[m] ?? []).map(t => t.composition)])) }), storeId, 'family')
      .catch((error: unknown) => ({ failed: String((error as Error)?.message ?? error).slice(0, 300) })) as { failed?: string; css?: string; moments?: Array<Record<string, unknown>> } | null;
    const family = designId();
    const shared = String(raw?.css ?? '').slice(0, 24_000);
    const results = [];
    for (const moment of moments) {
      const id = designId();
      const given = (Array.isArray(raw?.moments) ? raw!.moments : []).find(m => m?.moment === moment);
      let answer: any = given ? { composition: given.composition, flow: given.flow, steps: given.steps, css: `${shared}\n${String(given.css ?? '').slice(0, 6_000)}`, launcher: '' } : null;
      let problems: string[] = raw?.failed ? [`El modelo no respondió: ${raw.failed}`] : given ? [] : [`Falta el momento ${moment} en la respuesta.`];
      let candidate: Candidate | null = null, measures: FlowStepMeasure[] | null = null;
      // The family's answer, then up to two repairs of this moment alone.
      for (let attempt = 0; attempt < 3 && !candidate; attempt++) {
        options.signal?.throwIfAborted();
        if (attempt > 0) {
          if (/usage_limit|quota|rate.?limit|insufficient|ServiceUnavailable|no está configurad/i.test(problems[0] ?? '')) break;
          const previous = answer ? { flow: answer.flow, steps: Object.fromEntries((Array.isArray(answer.steps) ? answer.steps : []).map((st: any) => [String(st?.id), String(st?.html ?? '')])), css: String(answer.css ?? '') } : undefined;
          answer = await this.call(popupDesignPrompt({ ...base, moment, taken: (taken[moment] ?? []).map(t => t.composition), retryProblems: problems, previous }), storeId, 'design').catch(() => null);
          if (answer && shared && !String(answer.css ?? '').startsWith(shared.slice(0, 200))) answer = { ...answer, css: `${shared}\n${String(answer.css ?? '')}` };
        }
        if (!answer) { problems = problems.length ? problems : ['No llegó una respuesta del modelo.']; continue; }
        const built = this.assemble(answer, id, g.products.map(p => p.id), taken[moment] ?? [], undefined, moment);
        if ('problems' in built) { problems = built.problems; continue; }
        measures = await this.measure({ storeName: g.store.name, design: { id, flow: built.flow, steps: built.steps, css: built.css, capture: g.capture, percent: g.percent },
          items: g.rows.map(r => ({ id: r.id, name: r.name, price: r.amount, imageUrls: r.imageUrls, categoryId: r.categoryId })), photos: g.photos, context: this.checkContext(moment, g.rows) });
        problems = measures ? checkFlowRender(measures) : ['No se pudo abrir el navegador de prueba.'];
        if (!problems.length) candidate = built;
      }
      const saved = await this.saveMoment(storeId, { id, family, moment, createdBy: options.createdBy, request: options.request, capture: g.capture, percent: g.percent, candidate, problems, measures });
      results.push(saved);
      // Pointed as soon as it is saved, over the settings as they are now: a switch the merchant made meanwhile, or a moment
      // they had switched off, stays as they left it.
      if (saved.status === 'LIVE') await this.point(storeId, now => {
        if (moment === 'welcome') return typeof now.popupDesignOff === 'string' && now.popupDesignOff && !now.popupDesignId ? { popupDesignOff: id } : { popupDesignId: id, popupDesignOff: null };
        const pointers = { ...((now.popupMoments ?? {}) as Record<string, { id?: string; off?: boolean }>) };
        pointers[moment] = pointers[moment]?.off ? { id, off: true } : { id };
        return { popupMoments: pointers };
      });
    }
    return { family, results };
  }

  private async post(storeId: string, content: string, metadata: Record<string, unknown> = {}) {
    const thread = await this.prisma.storeAgentThread.upsert({ where: { storeId }, create: { storeId }, update: {} });
    await this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'ASSISTANT', content, metadata: metadata as never } });
  }

  /** A chat request about the popup (spec 2026-11-18 §8): a discount or contact change at once, anything else a new design. */
  async forChat(job: { merchantId: string; storeId: string; input: { instruction: string }; signal?: AbortSignal }): Promise<{ skipped: true }> {
    const ask = popupChatRequest(job.input.instruction) ?? { redesign: true, request: job.input.instruction };
    // Part 2 (spec 2026-11-21 §8): one of the other popups switched on/off, or redesigned (alone or all together).
    if (!ask.redesign && ask.moment && ask.moment !== 'all' && ask.on !== undefined) {
      await this.updateSettings(job.merchantId, job.storeId, { moment: ask.moment, on: ask.on });
      await this.post(job.storeId, `Listo: el popup ${MOMENT_NAMES[ask.moment]} quedó ${ask.on ? 'encendido' : 'apagado'}.`, { popupSettings: true });
      return { skipped: true };
    }
    if (ask.redesign && ask.moment && ask.moment !== 'welcome') {
      await this.post(job.storeId, 'Diseñando tus popups (2–4 minutos)…', { progress: 'popup' });
      const moments = ask.moment === 'all' ? [...POPUP_MOMENTS] : [ask.moment];
      const result = await this.designFamily(job.merchantId, job.storeId, { createdBy: 'merchant-chat', moments, request: ask.request, signal: job.signal });
      const live = result.results.filter(r => r.status === 'LIVE').map(r => MOMENT_NAMES[r.moment]);
      const failed = result.results.filter(r => r.status === 'FAILED').map(r => MOMENT_NAMES[r.moment]);
      await this.post(job.storeId, [live.length ? `Listo: el popup ${live.join(', ')}.` : '', failed.length ? `No logré el ${failed.join(', ')}; sigue como estaba.` : '', 'Míralos en Crecimiento › Popups.'].filter(Boolean).join(' '), { popupFamily: result.family });
      return { skipped: true };
    }
    if (!ask.redesign) {
      await this.updateSettings(job.merchantId, job.storeId, { ...(ask.percent !== undefined ? { percent: ask.percent } : {}), ...(ask.capture ? { capture: ask.capture } : {}) });
      const said = [ask.percent !== undefined ? `el descuento quedó en ${clamp(ask.percent)}%` : '', ask.capture ? `ahora pide ${ask.capture === 'email' ? 'el correo' : 'el WhatsApp'}` : ''].filter(Boolean).join(' y ');
      await this.post(job.storeId, `Listo: en tu popup ${said}.`, { popupSettings: true });
      return { skipped: true };
    }
    await this.post(job.storeId, 'Diseñando tu popup nuevo (1–2 minutos)…', { progress: 'popup' });
    const result = await this.design(job.merchantId, job.storeId, { createdBy: 'merchant-chat', request: ask.request, signal: job.signal, layout: ask.layout });
    await this.post(job.storeId, result.design.status === 'LIVE'
      ? `Listo: tu popup nuevo — ${(result.design as { composition?: string }).composition ?? ''}. Míralo en Crecimiento › Popups.`
      : 'No pude dejar un popup que pase las revisiones; tu popup sigue igual. Pídemelo de nuevo con otra idea.', { popupDesign: result.design });
    return { skipped: true };
  }

  /** Up to 4 product photos cut out on our server (no model call, nothing leaves pagosYa), uploaded as transparent WebP and served to
   *  the browser check too. A photo that is a scene gives none. */
  private async cutouts(products: Array<{ name: string; photo: string }>, photos: FlowRenderInput['photos']) {
    const model = join(this.config.get<string>('app.uploadsDir') ?? 'uploads', '..', 'models', 'silueta.onnx');
    const out: Array<{ url: string; product: string }> = [];
    for (const product of products.filter(p => p.photo && photos[p.photo]).slice(0, 6)) {
      if (out.length >= 4) break;
      try {
        const made = await this.cut(photos[product.photo].bytes, model);
        if (!made.cut) continue;
        const webp = await sharp(made.cut).trim().resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
        const stored = await this.uploads.saveBuffer(webp, 'image/webp');
        photos[stored.url] = { bytes: webp, contentType: 'image/webp' };
        out.push({ url: stored.url, product: product.name });
      } catch { /* no cut-out for this photo */ }
    }
    return out;
  }

  async restore(merchantId: string, storeId: string, id: string) {
    await this.store(merchantId, storeId);
    const row = await this.prisma.storePopupDesign.findFirst({ where: { id, storeId } });
    if (!row || row.status === 'FAILED') throw new NotFoundException('Esa versión del popup no existe.');
    const moment = (row.moment ?? 'welcome') as PopupMoment;
    await this.prisma.$transaction(async tx => {
      await tx.storePopupDesign.updateMany({ where: { storeId, moment, status: 'LIVE', id: { not: id } }, data: { status: 'RETIRED' } });
      await tx.storePopupDesign.update({ where: { id }, data: { status: 'LIVE' } });
    });
    if (moment === 'welcome') await this.point(storeId, { popupDesignId: id, popupDesignOff: null });
    else await this.point(storeId, { popupMoments: { ...(((await this.settings(storeId)).popupMoments ?? {}) as Record<string, unknown>), [moment]: { id } } });
  }

  /** The Popups page (spec 2026-11-18 §9): versions newest first, the live one, its settings and the store's products. */
  async overview(merchantId: string, storeId: string) {
    await this.store(merchantId, storeId);
    const settings = await this.settings(storeId);
    const all = await this.prisma.storePopupDesign.findMany({ where: { storeId }, orderBy: { version: 'desc' }, take: 60, select: { id: true, version: true, status: true, moment: true, composition: true, previews: true, percent: true, capture: true, flow: true, createdAt: true } });
    const rows = all.filter(row => (row.moment ?? 'welcome') === 'welcome');
    const products = await this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { createdAt: 'desc' }, take: 40 });
    const liveId = typeof settings.popupDesignId === 'string' ? settings.popupDesignId : null;
    const current = rows.find(row => row.id === (liveId ?? settings.popupDesignOff));
    const pick = ((current?.flow ?? []) as PopupFlow).find(step => step.kind === 'pick') as { products?: string[] } | undefined;
    return {
      liveId, on: Boolean(liveId), percent: current?.percent ?? clamp(Number(settings.popupDesignPercent) || 10), capture: current?.capture ?? (settings.popupDesignCapture === 'email' ? 'email' : 'whatsapp'),
      pick: pick?.products ?? [], products,
      designs: rows.map(({ flow: _flow, ...row }) => row),
      moments: await this.momentsOverview(storeId, settings, all, liveId),
    };
  }

  /** Part 2 (spec 2026-11-21 §8): each moment's versions, whether it shows, and what shoppers did with it in the last 30 days. */
  private async momentsOverview(storeId: string, settings: Record<string, unknown>, rows: Array<{ moment: string | null; flow: unknown } & Record<string, unknown>>, liveId: string | null) {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const tallies = await this.prisma.storePopupEvent.groupBy({ by: ['moment', 'kind'], where: { storeId, createdAt: { gte: since } }, _count: { _all: true } })
      .catch(() => [] as Array<{ moment: string; kind: string; _count: { _all: number } }>);
    const pointers = (settings.popupMoments ?? {}) as Record<string, { id?: string; off?: boolean }>;
    return POPUP_MOMENTS.map(moment => {
      const live = moment === 'welcome' ? liveId : pointers[moment]?.id && !pointers[moment]?.off ? pointers[moment]!.id! : null;
      const count = (kind: string) => tallies.filter(t => t.moment === moment && t.kind === kind).reduce((sum, t) => sum + t._count._all, 0);
      return { moment, liveId: live, on: Boolean(live), designs: rows.filter(r => (r.moment ?? 'welcome') === moment).map(({ flow: _flow, ...row }) => row), counts: { shown: count('shown'), closed: count('closed'), completed: count('completed') } };
    });
  }

  /** Percent, contact and the products in «¿qué buscas?» change without a model call; on/off turns the YAPI popup off (the old one shows). */
  async updateSettings(merchantId: string, storeId: string, patch: { percent?: number; capture?: 'whatsapp' | 'email'; products?: string[]; on?: boolean; moment?: PopupMoment }) {
    await this.store(merchantId, storeId);
    // Part 2: another moment is only switched on/off; its design stays to switch back to.
    if (patch.moment && patch.moment !== 'welcome') {
      const pointers = { ...(((await this.settings(storeId)).popupMoments ?? {}) as Record<string, { id?: string; off?: boolean }>) };
      const entry = pointers[patch.moment];
      if (!entry?.id) throw new NotFoundException('Ese popup todavía no existe; pídeselo a YAPI.');
      if (patch.on !== undefined) pointers[patch.moment] = patch.on ? { id: entry.id } : { id: entry.id, off: true };
      await this.point(storeId, { popupMoments: pointers });
      return;
    }
    const settings = await this.settings(storeId);
    const liveId = typeof settings.popupDesignId === 'string' && settings.popupDesignId ? settings.popupDesignId : '';
    const offId = typeof settings.popupDesignOff === 'string' && settings.popupDesignOff ? settings.popupDesignOff : '';
    // Final review I3: the design these settings belong to is the one shown, or the one switched off.
    const row = liveId || offId ? await this.prisma.storePopupDesign.findFirst({ where: { id: liveId || offId, storeId } }) : null;
    if (patch.products) {
      const owned = await this.prisma.paymentLink.findMany({ where: { storeId, id: { in: patch.products }, status: 'ACTIVE' }, select: { id: true } });
      if (patch.products.length > 6) throw new BadRequestException('Elige hasta 6 productos para «¿qué buscas?».');
      if (owned.length !== patch.products.length || owned.length < 2) throw new BadRequestException('Elige al menos 2 productos activos de tu tienda.');
    }
    const percent = patch.percent !== undefined ? clamp(patch.percent) : undefined;
    if (row) {
      const flow = patch.products ? (row.flow as PopupFlow).map(step => step.kind === 'pick' ? { ...step, products: patch.products! } : step) : undefined;
      await this.prisma.storePopupDesign.update({ where: { id: row.id }, data: { ...(percent !== undefined ? { percent } : {}), ...(patch.capture ? { capture: patch.capture } : {}), ...(flow ? { flow: flow as never } : {}) } });
    }
    // Part 2 (spec 2026-11-21 §4): one percent and one channel for the whole family of popups.
    if (percent !== undefined || patch.capture) await this.prisma.storePopupDesign.updateMany({ where: { storeId, status: 'LIVE' }, data: { ...(percent !== undefined ? { percent } : {}), ...(patch.capture ? { capture: patch.capture } : {}) } });
    // On/off only when it changes: off keeps the shown design to come back to; on brings it back only while it is still LIVE.
    const switching = patch.on === false && liveId ? { popupDesignId: null, popupDesignOff: liveId }
      : patch.on === true && !liveId && row && row.status === 'LIVE' ? { popupDesignId: row.id, popupDesignOff: null } : {};
    await this.point(storeId, { ...(percent !== undefined ? { popupDesignPercent: percent } : {}), ...(patch.capture ? { popupDesignCapture: patch.capture } : {}), ...switching });
  }
}
