import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SourceConversationService, type StorePlanInput } from './source-conversation.service';
import { checkPlan, enforceRules, type CatalogFacts } from './plan/store-plan-checks';
import { clashesWith, clashWords, fingerprintOf, makeUnique } from './plan/store-plan-fingerprint';
import { catalogFacts, otherFingerprints } from './plan/store-plan-data';
import type { PlanCatalogue, StorePlan } from './plan/store-plan';
import type { AppliedPlan } from './source-templates.service';
import { merchantAsksForPhotoGroup } from './source-media-design';

/** Where the catalogue and the dice come from; a seam so tests do not load the template package. */
export class StorePlanParts {
  constructor(readonly catalogue: () => PlanCatalogue, readonly roll: (storeId: string, facts: CatalogFacts) => Record<string, string>) {}
}
type PlanData = { catalogFacts: typeof catalogFacts; otherFingerprints: typeof otherFingerprints };

/** YAPI plan card (spec 2026-10-22): plan → checks → unique; what the card shows and what Construir builds. */
@Injectable()
export class SourceStorePlanService {
  constructor(private readonly prisma: PrismaService, private readonly dialogue: SourceConversationService, private readonly parts: StorePlanParts,
    @Optional() private readonly data: PlanData = { catalogFacts, otherFingerprints }) {}

  async draft(merchantId: string, storeId: string, input: { revision: number; request: string; what: string; photos: string[]; current?: StorePlanInput['current']; previous?: StorePlan }) {
    const catalogue = this.parts.catalogue();
    const [catalog, others, store] = await Promise.all([this.data.catalogFacts(this.prisma, storeId), this.data.otherFingerprints(this.prisma, storeId),
      this.prisma.store.findFirst({ where: { id: storeId }, select: { name: true } }).catch(() => null)]);
    const facts: CatalogFacts = { ...catalog, shownPhotos: input.photos.slice(0, 8).length, photoGroups: merchantAsksForPhotoGroup(input.request) };
    const ask = (clash?: string) => this.dialogue.planStore(merchantId, { storeId, storeName: store?.name ?? '', what: input.what, request: input.request, products: facts.productNames,
      facts, photos: input.photos, catalogue, revision: input.revision, ...(input.current ? { current: input.current } : {}), ...(input.previous ? { previous: input.previous } : {}), ...(clash ? { clash } : {}) });
    // An edit starts from the store as it is; a new store from the dice, told the real catalog (final review 2026-10-22).
    const rolled = input.current ? input.current.variants : this.parts.roll(storeId, facts);
    const checkedOf = (plan: StorePlan) => {
      const checked = checkPlan(plan, facts, rolled);
      return { checked, fingerprint: fingerprintOf({ variants: checked.variants, sections: checked.sections, palette: plan.colour.palette, fonts: plan.fonts.id, accent: plan.colour.accent }) };
    };
    const first = await ask();
    if (!first) return null;
    let { checked, fingerprint } = checkedOf(first);
    const clash = clashesWith(fingerprint, others);
    if (clash) {
      const again = await ask(clashWords(clash.fields)).catch(() => null);
      if (again) ({ checked, fingerprint } = checkedOf(again));
    }
    // Menu and filters follow the catalog, never a swap; a size guide the catalog needs is never swapped away.
    const swappable = Object.fromEntries(Object.entries(catalogue.variants).filter(([part]) => part !== 'menu' && part !== 'filters'));
    const unique = makeUnique(fingerprint, others, swappable, catalogue.sections, storeId, facts.sizeProducts ? ['sizes'] : []);
    const applied: AppliedPlan = { variants: enforceRules({ ...checked.variants, ...unique.fingerprint.variants }, facts), sections: unique.fingerprint.sections, palette: checked.plan.colour.palette,
      fonts: checked.plan.fonts.id, ...(checked.plan.colour.accent ? { accent: checked.plan.colour.accent } : {}), dna: checked.dna };
    return { plan: checked.plan, applied, exhausted: unique.exhausted };
  }

  /** Free-first (owner 2026-10-22): the approved plan as YAPI's brief for a store designed from scratch, like PEPPA and Antojo. */
  freeBrief(plan: StorePlan, request?: string): string {
    const custom = plan.custom.map(section => `- Sección propia «${section.kind}» (${section.why}): ${section.items.map(item => `${item.name} → ${item.layout}${item.colourFrom ? `, color de ${item.colourFrom}` : ''}`).join('; ')}`);
    return ['Diseña esta tienda desde cero, con un diseño propio (sin la plantilla), siguiendo este plan que el comercio aprobó:',
      ...plan.card.map(line => `• ${line}`), ...custom,
      plan.motif ? `- Motivo de marca: ${plan.motif.what}, sacado de ${plan.motif.from}; con función, nunca solo adorno.` : '',
      'Reglas: fondo claro y tinta oscura; un solo acento para la tienda; nunca inventes un color (solo del logo, de las fotos o de la marca confirmada); tarjetas de producto normales, 3 o 4 por fila; nada de bandas oscuras solo de texto; ningún adorno sin función; secciones que solo esta tienda tendría, con movimiento y letra con carácter.',
      request ? `Pedido del comercio: ${request}` : ''].filter(Boolean).join('\n');
  }

  followUpBrief(plan: StorePlan): string | null {
    const custom = plan.custom.map(section => `- ${section.kind} (${section.why}): ${section.items.map(item => `${item.name} → layout ${item.layout}${item.colourFrom ? `, color de ${item.colourFrom}` : ''}`).join('; ')}`);
    const motif = plan.motif ? `- Motivo de marca: ${plan.motif.what}, sacado de ${plan.motif.from}; con función, nunca solo adorno.` : '';
    if (!custom.length && !motif) return null;
    return ['Construye sobre esta tienda las secciones propias del plan que el comercio aprobó:', ...custom, motif,
      'Cada bloque con su propio layout según lo que dice, y movimiento con las piezas data-pya-motion del kit. Nunca inventes un color: usa solo el color indicado (de esa foto o del logo) o el fondo de la tienda. Tarjetas de producto normales. Nada de bandas oscuras solo de texto. Nunca más de dos franjas en marquesina seguidas (mejor una): varias marcas van juntas en una sección con contenido, no una franja por marca.'].filter(Boolean).join('\n');
  }
}
