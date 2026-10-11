/** "Elige tu estilo" proposal (spec 2026-10-11): what the generation row saves and what Studio's cards read. */
import type { StyleSlot } from './design-engine/style-draws';
import type { SourceDesign } from './source-design';
import type { GenerateSourceProjectDto } from './dto/generate-source-project.dto';
import type { SourceImageUse } from './source-setup';
import { SOURCE_FONT_CATALOG } from './source-font-catalog';

export type StyleProposalStatus = 'RUNNING' | 'AWAITING_STYLE' | 'PICKED' | 'SUPERSEDED';
export type StyleProposal = { version: 1; status: StyleProposalStatus; slots: Array<StyleSlot & { playbook: string }>; design: SourceDesign | null; heroes: Array<{ html: string; source: 'model' | 'template' } | null>; assetMap: Array<{ original: string; path: string }>; request: { dto: GenerateSourceProjectDto; imageUses: SourceImageUse[]; redesign: boolean }; picked?: number; createdAt: string };
export type StyleCardView = { index: number; slot: number; name: string; mode: 'calm' | 'bold'; vibe: string; inspiration: string[]; fonts: { display: string; text: string; displayFamily: string; textFamily: string }; palette: string[]; html: string | null; source: 'model' | 'template' | null };

const family = (id: string) => SOURCE_FONT_CATALOG.find(font => font.id === id)?.family ?? id;

/** The saved hero uses the store's bundle paths (what the builder keeps); the card iframe needs loadable URLs. */
export function cardHtmlForPreview(html: string, assetMap: StyleProposal['assetMap']): string {
  let out = html.replace(/assets\/([a-z0-9-]+\.ttf)/gi, (_match, file: string) => `/v1/source-fonts/${file}`);
  for (const { original, path } of assetMap) out = out.split(path).join(original);
  return out;
}

export function styleProposalView(generationId: string, proposal: StyleProposal) {
  const cards: StyleCardView[] = (proposal.design?.concepts ?? []).map((concept, index) => {
    const slot = concept.card!.slot;
    const palette = proposal.slots[slot]?.palette;
    const hero = proposal.heroes[index] ?? null;
    const display = concept.dna?.type?.display ?? 'bricolage', text = concept.dna?.type?.text ?? 'instrument';
    return { index, slot, name: concept.card!.name, mode: concept.card!.mode, vibe: concept.card!.vibe, inspiration: concept.card!.inspiration,
      fonts: { display, text, displayFamily: family(display), textFamily: family(text) },
      palette: palette ? [palette.paper, palette.ink, palette.accent, palette.accent2] : [],
      html: hero ? cardHtmlForPreview(hero.html, proposal.assetMap) : null, source: hero?.source ?? null };
  });
  return { generationId, status: proposal.status, recommended: proposal.design?.selected ?? 0, ...(proposal.status === 'PICKED' && proposal.picked !== undefined ? { picked: proposal.picked } : {}), cards };
}

export function styleProposalFrom(value: unknown): StyleProposal | null {
  const proposal = value as StyleProposal | null;
  return proposal && proposal.version === 1 && Array.isArray(proposal.slots) && Array.isArray(proposal.heroes) && Boolean(proposal.request?.dto) ? proposal : null;
}
