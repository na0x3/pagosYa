import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { PlansService } from '../plans/plans.service';
import { AiUsageService } from '../ai-usage/ai-usage.service';
import { brandCall } from '../storefront-source/brand/brand-model-call';
import { sourceProvider } from '../storefront-source/source-provider';
import { renderedSteps, validateFlow, type PopupFlow } from './popup-flow';
import { cleanStepHtml } from './popup-html';
import { scopePopupCss } from './popup-css';
import { popupFingerprint, varietyProblem } from './popup-fingerprint';
import { checkFlowRender, measureFlow, type FlowRenderInput, type FlowStepMeasure } from './popup-flow-render';
import { POPUP_DESIGN_SCHEMA, popupDesignPrompt } from './popup-design-prompt';

type Created = 'yapi' | 'merchant-chat' | 'batch';
type Candidate = { flow: PopupFlow; steps: Record<string, string>; css: string; launcher: string | null; composition: string; fingerprint: string };
const designId = () => `c${Array.from(randomBytes(24), byte => '0123456789abcdefghijklmnopqrstuvwxyz'[byte % 36]).join('')}`;
const clamp = (value: number) => Math.max(5, Math.min(30, Math.round(value)));

/** Popups 2.0 (spec 2026-11-18 §5–6, §8): YAPI writes a store's popup; it is cleaned, played in a real browser and compared with the
 *  popups other stores already have, retried once with what failed, and saved LIVE (the store points at it) or FAILED (the store
 *  keeps the popup it had). */
@Injectable()
export class PopupDesignService {
  /** The model call and the browser check, replaceable in tests. */
  call: (prompt: string) => Promise<unknown> = prompt => this.modelCall(prompt);
  measure: (input: FlowRenderInput) => Promise<FlowStepMeasure[] | null> = input => measureFlow(input);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly uploads: UploadsService,
    @Optional() private readonly plans?: PlansService,
    @Optional() private readonly usage?: AiUsageService,
  ) {}

  private async modelCall(prompt: string) {
    const model = this.config.get<string>('app.yapiPopupModel') ?? 'gpt-5.6-sol';
    const provider = sourceProvider(this.config, model);
    const { json } = await brandCall({ endpoint: provider.endpoint, apiKey: provider.apiKey, model, record: async (body, ms, ok) => { await this.usage?.record('popup-design', 'popup-design', model, body, ms, ok ? 'COMPLETED' : 'FAILED'); } },
      { text: prompt, schemaName: 'popup_design', schema: POPUP_DESIGN_SCHEMA, maxOutputTokens: 16_000 });
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
  private async point(storeId: string, patch: Record<string, unknown>) {
    const settings = { ...(await this.settings(storeId)), ...patch };
    await this.prisma.storeRetention.upsert({ where: { storeId }, create: { storeId, settings: settings as never }, update: { settings: settings as never } });
  }

  /** YAPI's answer made safe and complete, or the list of what is wrong (in the words YAPI gets back). */
  private assemble(raw: any, id: string, products: string[], taken: Array<{ fingerprint: string; composition: string }>): Candidate | { problems: string[] } {
    const problems: string[] = [];
    const flowResult = validateFlow(raw?.flow, products);
    if ('problems' in flowResult) return { problems: flowResult.problems };
    const given = new Map<string, string>((Array.isArray(raw?.steps) ? raw.steps : []).map((step: any) => [String(step?.id), String(step?.html ?? '')]));
    const steps: Record<string, string> = {};
    for (const step of renderedSteps(flowResult.flow)) {
      const cleaned = cleanStepHtml(given.get(step.id) ?? '', step.kind);
      if ('problem' in cleaned) problems.push(`paso ${step.id}: ${cleaned.problem}`); else steps[step.id] = cleaned.html;
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
    const cleanLauncher = launcher ? cleanStepHtml(`<div><button data-close hidden></button>${launcher}</div>`, 'offer') : null;
    return { flow: flowResult.flow, steps, css: scoped.css, launcher: cleanLauncher && 'html' in cleanLauncher ? cleanLauncher.html : null, composition, fingerprint };
  }

  async design(merchantId: string, storeId: string, options: { createdBy: Created; request?: string; signal?: AbortSignal }) {
    const store = await this.store(merchantId, storeId);
    if (options.createdBy !== 'batch') await this.plans?.assertCredits(storeId);
    const settings = await this.settings(storeId);
    const capture = settings.popupDesignCapture === 'email' ? 'email' as const : 'whatsapp' as const;
    const percent = clamp(Number(settings.popupDesignPercent) || 10);
    const rows = await this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, select: { id: true, name: true, amount: true, imageUrls: true }, take: 12 });
    const products = rows.map(row => ({ id: row.id, name: row.name, price: `Bs ${(row.amount / 100).toLocaleString('es-BO')}`, photo: (row.imageUrls ?? []).find(url => url.startsWith('/v1/uploads/')) ?? '' }));
    const brief = (store.onboarding as { brandBrief?: { identity?: { palette?: Record<string, string>; voice?: string }; research?: { niche?: string } } } | null)?.brandBrief;
    const taken = await this.prisma.storePopupDesign.findMany({ where: { status: 'LIVE', storeId: { not: storeId } }, orderBy: { createdAt: 'desc' }, take: 30, select: { fingerprint: true, composition: true } });
    const photos: FlowRenderInput['photos'] = {};
    for (const photo of [...new Set(products.map(p => p.photo).filter(Boolean))]) {
      const bytes = await this.uploads.getBuffer(photo.split('/').at(-1)!).catch(() => null);
      if (bytes) photos[photo] = { bytes, contentType: /\.png$/i.test(photo) ? 'image/png' : /\.webp$/i.test(photo) ? 'image/webp' : 'image/jpeg' };
    }
    const id = designId();
    let problems: string[] = [];
    let candidate: Candidate | null = null;
    let measures: FlowStepMeasure[] | null = null;
    for (let attempt = 0; attempt < 2 && !candidate; attempt++) {
      options.signal?.throwIfAborted();
      const raw = await this.call(popupDesignPrompt({ storeName: store.name, sector: brief?.research?.niche ?? '', palette: brief?.identity?.palette ?? {}, fonts: [], voice: brief?.identity?.voice ?? '',
        photos: Object.keys(photos), products, capture, percent, taken: taken.map(t => t.composition), request: options.request, retryProblems: problems.length ? problems : undefined })).catch(() => null);
      const built = raw ? this.assemble(raw, id, products.map(p => p.id), taken) : { problems: ['No llegó una respuesta del modelo.'] };
      if ('problems' in built) { problems = built.problems; continue; }
      measures = await this.measure({ storeName: store.name, design: { id, flow: built.flow, steps: built.steps, css: built.css, capture, percent }, items: rows.map(r => ({ id: r.id, name: r.name, price: r.amount, imageUrls: r.imageUrls })), photos });
      problems = measures ? checkFlowRender(measures) : ['No se pudo abrir el navegador de prueba.'];
      if (!problems.length) candidate = built;
    }
    const version = ((await this.prisma.storePopupDesign.aggregate({ where: { storeId }, _max: { version: true } }))._max.version ?? 0) + 1;
    const previews = [];
    for (const m of (measures ?? []).filter(m => m.size.width < 500 && m.screenshot.length)) previews.push({ stepId: m.stepId, url: (await this.uploads.saveBuffer(m.screenshot, 'image/jpeg')).url });
    const base = { id, storeId, version, createdBy: options.createdBy, request: options.request ?? null, capture, percent, checks: { problems } as never, previews: (candidate ? previews : null) as never };
    if (!candidate) {
      await this.prisma.storePopupDesign.create({ data: { ...base, status: 'FAILED', flow: [] as never, steps: {} as never, css: '', composition: '', fingerprint: '' } });
      return { design: { id, version, status: 'FAILED' as const }, problems };
    }
    await this.prisma.$transaction(async tx => {
      await tx.storePopupDesign.updateMany({ where: { storeId, status: 'LIVE', id: { not: id } }, data: { status: 'RETIRED' } });
      await tx.storePopupDesign.create({ data: { ...base, status: 'LIVE', flow: candidate!.flow as never, steps: candidate!.steps as never, css: candidate!.css, launcher: candidate!.launcher, composition: candidate!.composition, fingerprint: candidate!.fingerprint } });
    });
    await this.point(storeId, { popupDesignId: id });
    return { design: { id, version, status: 'LIVE' as const, composition: candidate.composition }, problems: [] };
  }

  async restore(merchantId: string, storeId: string, id: string) {
    await this.store(merchantId, storeId);
    const row = await this.prisma.storePopupDesign.findFirst({ where: { id, storeId } });
    if (!row || row.status === 'FAILED') throw new NotFoundException('Esa versión del popup no existe.');
    await this.prisma.$transaction(async tx => {
      await tx.storePopupDesign.updateMany({ where: { storeId, status: 'LIVE', id: { not: id } }, data: { status: 'RETIRED' } });
      await tx.storePopupDesign.update({ where: { id }, data: { status: 'LIVE' } });
    });
    await this.point(storeId, { popupDesignId: id });
  }

  async list(merchantId: string, storeId: string) {
    await this.store(merchantId, storeId);
    return this.prisma.storePopupDesign.findMany({ where: { storeId }, orderBy: { version: 'desc' }, take: 20, select: { id: true, version: true, status: true, composition: true, previews: true, percent: true, capture: true, createdAt: true } });
  }

  /** Percent, contact and the products in «¿qué buscas?» change without a model call; on/off turns the YAPI popup off (the old one shows). */
  async updateSettings(merchantId: string, storeId: string, patch: { percent?: number; capture?: 'whatsapp' | 'email'; products?: string[]; on?: boolean }) {
    await this.store(merchantId, storeId);
    const settings = await this.settings(storeId);
    const id = typeof settings.popupDesignId === 'string' ? settings.popupDesignId : '';
    const row = id ? await this.prisma.storePopupDesign.findFirst({ where: { id, storeId } }) : null;
    if (patch.products) {
      const owned = await this.prisma.paymentLink.findMany({ where: { storeId, id: { in: patch.products }, status: 'ACTIVE' }, select: { id: true } });
      if (owned.length !== patch.products.length || owned.length < 2) throw new BadRequestException('Elige al menos 2 productos activos de tu tienda.');
    }
    const percent = patch.percent !== undefined ? clamp(patch.percent) : undefined;
    if (row) {
      const flow = patch.products ? (row.flow as PopupFlow).map(step => step.kind === 'pick' ? { ...step, products: patch.products! } : step) : undefined;
      await this.prisma.storePopupDesign.update({ where: { id: row.id }, data: { ...(percent !== undefined ? { percent } : {}), ...(patch.capture ? { capture: patch.capture } : {}), ...(flow ? { flow: flow as never } : {}) } });
    }
    await this.point(storeId, { ...(percent !== undefined ? { popupDesignPercent: percent } : {}), ...(patch.capture ? { popupDesignCapture: patch.capture } : {}),
      ...(patch.on === false ? { popupDesignId: null, popupDesignOff: row?.id ?? id } : {}), ...(patch.on === true && typeof settings.popupDesignOff === 'string' ? { popupDesignId: settings.popupDesignOff } : {}) });
  }
}
