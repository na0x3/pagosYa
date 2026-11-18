import type { BrandBrief } from './brand-brief-types';
import { fontFamily } from './brand-identity';

export type BrandCardData = { storeName: string; oneLiner: string; swatches: Array<{ role: string; hex: string }>; fonts: Array<{ role: string; family: string }>; references: Array<{ name: string; why: string }>; searched: boolean };

const ROLE_NAMES = { ink: 'Texto', primary: 'Principal', accent: 'Acento', secondary: 'Secundario', base: 'Fondo' } as const;
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** What the Studio draws under YAPI's identity message (spec 2026-11-18 §3.4): only saved brief values. */
export function brandCardMetadata(brief: BrandBrief): { brandCard: BrandCardData } {
  const { palette, fonts } = brief.identity;
  return { brandCard: {
    storeName: brief.storeName, oneLiner: brief.identity.oneLiner,
    swatches: (Object.keys(ROLE_NAMES) as Array<keyof typeof ROLE_NAMES>).map(role => ({ role: ROLE_NAMES[role], hex: palette[role] })),
    fonts: [{ role: 'Títulos', family: fontFamily(fonts.display) }, { role: 'Secundaria', family: fontFamily(fonts.secondary) }, { role: 'Texto', family: fontFamily(fonts.body) }],
    references: brief.research.references, searched: brief.research.searched,
  } };
}

export const brandCardText = (brief: BrandBrief) => `Esta es la nueva identidad de ${brief.storeName}: ${lower(brief.identity.oneLiner)}`;

/** The last reply: what was done, then two next edits drawn from what converts in the niche. */
export function brandDoneText(brief: BrandBrief, shot: number, built: boolean): string {
  const did = ['investigué tu nicho', 'armé tu identidad', ...(shot ? [`fotografié ${shot} escenas de tus productos`] : []), ...(built ? ['construí tu tienda con todo eso'] : [])];
  const next = brief.research.patterns.slice(0, 2).map(pattern => `«${pattern}»`);
  return `Listo: ${did.join(', ')}.${next.length ? ` Lo que mejor vende en tu nicho: ${next.join(' y ')}. ¿Quieres que lo agregue?` : ''}`;
}
