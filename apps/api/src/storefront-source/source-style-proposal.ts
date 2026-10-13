/** "Elige tu estilo" proposal (spec 2026-10-11): what the generation row saves and what Studio's cards read. */
import type { StyleSlot } from './design-engine/style-draws';
import type { SourceDesign } from './source-design';
import type { GenerateSourceProjectDto } from './dto/generate-source-project.dto';
import type { SourceImageUse } from './source-setup';
import { SOURCE_FONT_CATALOG } from './source-font-catalog';
import { commerceSummary } from './design-engine/commerce-draw';
import { decodeEntities, FALLBACK_HEADER_SHAPE, HEADER_SHAPES, headerFact, renderSourceHeader, swapPreviewHeader, type HeaderShape } from './source-header';
import { sourceSitePurpose } from './source-site-purpose';

/** Spec 2026-10-13: the menu a card shows before any section exists; the built store links its own marked sections. */
const PREVIEW_LINKS = { shop: ['Productos', 'Nosotros', 'Contacto'], showcase: ['Servicios', 'Nosotros', 'Contacto'] };

export type StyleProposalStatus = 'RUNNING' | 'AWAITING_STYLE' | 'PICKED' | 'SUPERSEDED';
export type StyleProposal = { version: 1; status: StyleProposalStatus; slots: Array<StyleSlot & { playbook: string }>; design: SourceDesign | null; heroes: Array<{ html: string; source: 'model' | 'template' } | null>; assetMap: Array<{ original: string; path: string }>; request: { dto: GenerateSourceProjectDto; imageUses: SourceImageUse[]; redesign: boolean }; picked?: number; createdAt: string;
  /** The palette each hero was drawn with, by concept index: a slot has none when the merchant confirmed brand colours. */
  heroPalettes?: Array<HeroPalette | null>;
  /** By concept index, like heroes: true while that card shows its template hero and the model hero is still being written. */
  heroPending?: boolean[];
  /** Spec 2026-10-12 faster generation: both cards are planned, so the merchant may pick while heroes are still drawn. */
  pickable?: boolean };
/** What the merchant decided on a running proposal: the chat wrote PICKED with the card, or a new request SUPERSEDED it. */
export type StyleDecision = { status: 'PICKED'; picked: number } | { status: 'SUPERSEDED' };
type HeroPalette = { paper: string; ink: string; accent: string; accent2: string };
export type StyleCardView = { index: number; slot: number; name: string; mode: 'calm' | 'bold'; vibe: string; inspiration: string[]; fonts: { display: string; text: string; displayFamily: string; textFamily: string }; palette: string[]; html: string | null; source: 'model' | 'template' | null; pending: boolean;
  /** "Cuenta: dividida · Pago: ticket · Carrito: hoja": the choice carries through to payment ('' for a slot without a commerce draw). */
  commerce: string };

const family = (id: string) => SOURCE_FONT_CATALOG.find(font => font.id === id)?.family ?? id;

/** The saved hero uses the store's bundle paths (what the builder keeps); the card iframe needs loadable URLs. */
export function cardHtmlForPreview(html: string, assetMap: StyleProposal['assetMap']): string {
  let out = html.replace(/assets\/([a-z0-9-]+\.ttf)/gi, (_match, file: string) => `/v1/source-fonts/${file}`);
  for (const { original, path } of assetMap) out = out.split(path).join(original);
  return out;
}

export function styleProposalView(generationId: string, proposal: StyleProposal, storeName = '') {
  const brief = (proposal.request.dto.brief ?? {}) as { sitePurpose?: unknown; businessInformation?: unknown };
  const purpose = sourceSitePurpose(brief);
  const previewHeader = (slot: number, heroHtml: string) => {
    const drawn = proposal.slots[slot]?.draw?.header ?? '';
    const shape = (HEADER_SHAPES as readonly string[]).includes(drawn) ? drawn as HeaderShape : FALLBACK_HEADER_SHAPE;
    const name = storeName || decodeEntities(heroHtml.match(/data-store-name[^>]*>([^<]{1,80})</)?.[1]?.trim() ?? '');
    const links = PREVIEW_LINKS[purpose === 'shop' ? 'shop' : 'showcase'].map(label => ({ href: '#', label }));
    return renderSourceHeader({ shape, purpose, storeName: name, links, fact: headerFact(brief.businessInformation), search: true });
  };
  const cards: StyleCardView[] = (proposal.design?.concepts ?? []).map((concept, index) => {
    const slot = concept.card!.slot;
    const palette = proposal.slots[slot]?.palette ?? proposal.heroPalettes?.[index] ?? undefined;
    const hero = proposal.heroes[index] ?? null;
    const display = concept.dna?.type?.display ?? 'bricolage', text = concept.dna?.type?.text ?? 'instrument';
    return { index, slot, name: concept.card!.name, mode: concept.card!.mode, vibe: concept.card!.vibe, inspiration: concept.card!.inspiration,
      fonts: { display, text, displayFamily: family(display), textFamily: family(text) },
      palette: palette ? [palette.paper, palette.ink, palette.accent, palette.accent2] : [],
      html: hero ? cardHtmlForPreview(swapPreviewHeader(hero.html, previewHeader(slot, hero.html)), proposal.assetMap) : null, source: hero?.source ?? null, pending: proposal.status === 'RUNNING' && proposal.heroPending?.[index] === true,
      commerce: commerceSummary(proposal.slots[slot]?.commerce ?? {}) };
  });
  return { generationId, status: proposal.status, recommended: proposal.design?.selected ?? 0, ...(proposal.status === 'PICKED' && proposal.picked !== undefined ? { picked: proposal.picked } : {}),
    ...(proposal.status === 'RUNNING' && proposal.pickable === true ? { pickable: true as const } : {}), cards };
}

export function styleProposalFrom(value: unknown): StyleProposal | null {
  const proposal = value as StyleProposal | null;
  return proposal && proposal.version === 1 && Array.isArray(proposal.slots) && Array.isArray(proposal.heroes) && Boolean(proposal.request?.dto) ? proposal : null;
}

/** The style run polls its own row for this (spec 2026-10-12): a pick names its card; anything else running is no decision. */
export function styleDecision(value: unknown): StyleDecision | null {
  const proposal = styleProposalFrom(value);
  if (proposal?.status === 'PICKED' && Number.isInteger(proposal.picked)) return { status: 'PICKED', picked: proposal.picked! };
  if (proposal?.status === 'SUPERSEDED') return { status: 'SUPERSEDED' };
  return null;
}
