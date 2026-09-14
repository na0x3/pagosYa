import { sourceStyleTokens, SOURCE_STYLE_TOKEN_CONTRACT, type SourceStyleTokens } from './source-style-tokens';
import { BadGatewayException } from '@nestjs/common';
import { SOURCE_ICON_NAMES, type SourceAsset } from './source-asset-library';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import type { SourceDesign } from './source-design';
import type { SourceMotionMode } from './source-motion';

export const SOURCE_VISUAL_SYSTEM_FILE = 'visual-system.json';
export const SOURCE_VISUAL_SYSTEM_VERSION = 3 as const;

/** Per-project guidance. Colors, fonts and geometry belong to the authored site,
 * not a server preset. Version 1 manifests remain in historical snapshots only. */
export type SourceVisualSystem = {
  version: 2 | typeof SOURCE_VISUAL_SYSTEM_VERSION;
  tokens?: SourceStyleTokens;
  typography: { display: string; rule: string };
  iconography: { family: 'lucide-local'; vocabulary: string[] };
  motion: { mode: SourceMotionMode; reducedMotion: string };
  layout: { sectionOrder: string[]; catalogSection: string | null; mobileRule: string };
  assets: Array<{ path: string; role: SourceAsset['role']; description: string; kind: SourceAsset['kind'] }>;
  invariants: string[];
};

export function buildSourceVisualSystem(mode: SourceMotionMode, assets: SourceAsset[] = [], design?: SourceDesign | null): SourceVisualSystem {
  const selected = design?.concepts?.[design.selected];
  return {
    version: SOURCE_VISUAL_SYSTEM_VERSION,
    typography: {
      display: selected?.typography || 'Choose typography from the merchant brief, brand and supplied references.',
      rule: 'Keep text legible, with natural wrapping and a clear hierarchy.',
    },
    iconography: { family: 'lucide-local', vocabulary: [...SOURCE_ICON_NAMES] },
    motion: { mode, reducedMotion: 'Respect prefers-reduced-motion and provide a pause path for continuous movement.' },
    layout: {
      sectionOrder: selected?.layout?.sections || [],
      catalogSection: selected?.layout?.catalogSection || null,
      mobileRule: selected?.mobile || 'Adapt the chosen composition to small screens with readable content and usable controls.',
    },
    assets: assets.filter(asset => asset.kind !== 'icon').map(({ path, role, description, kind }) => ({ path, role, description, kind })),
    invariants: [
      'Carry this project’s chosen identity through header, homepage, product page, cart, checkout and footer.',
      'Use real merchant data and confirmed local assets. Never invent products, prices, claims or image URLs.',
      'Keep product names, prices and purchase actions legible and associated.',
      'Preserve unrelated source on local edits; explicit current requests may change any requested visual property.',
      'Keep payment, cart, stock and checkout behavior platform-owned.',
    ],
  };
}

export function sourceVisualSystemContext(system: SourceVisualSystem): string {
  return `Project-specific design guidance derived from the current concept and available assets:
${JSON.stringify(system)}
There are no theme presets or default palettes, fonts, spacing scales, corner radii or page compositions. Choose these from the current merchant request, confirmed brand, supplied references and selected concept. ${SOURCE_STYLE_TOKEN_CONTRACT} For local edits, the actual authored source is the visual baseline; a saved manifest never overrides an explicit current request. Use available local icons consistently. Existing theme names or preset metadata are historical context, not binding instructions.`;
}

export const SOURCE_VISUAL_SYSTEM_CONTRACT = `Design each storefront for its own merchant brief and supplied assets. Choose composition, typography, palette, spacing, geometry and imagery for that project; do not fall back to a preset or make every business look alike. Carry the chosen identity coherently through product, cart and checkout. Current explicit requests override earlier design guidance for the requested scope. Preserve unrelated design and commerce behavior during local edits. ${SOURCE_STYLE_TOKEN_CONTRACT}`;

export function savedSourceVisualSystem(files: SourceProjectFileDto[] = []): SourceVisualSystem | null {
  try {
    const raw = files.find(file => file.path === SOURCE_VISUAL_SYSTEM_FILE && file.encoding !== 'base64')?.content;
    const value = raw ? JSON.parse(raw) : null;
    if (!value || ![2, SOURCE_VISUAL_SYSTEM_VERSION].includes(value.version) || !value.typography || !value.iconography || !value.layout || !value.motion || !Array.isArray(value.assets)) return null;
    return value as SourceVisualSystem;
  } catch { return null; }
}

export function validateSourceVisualSystem(files: SourceProjectFileDto[]): void {
  const source = files.filter(file => /\.(css|html|tsx|jsx)$/.test(file.path) && file.encoding !== 'base64').map(file => file.content).join('\n');
  if (/(?:lucide-react|react-icons|@heroicons|@phosphor-icons|hugeicons|@tabler\/icons)/.test(source)) {
    throw new BadGatewayException('El sistema visual mezcló una biblioteca de iconos externa. Usa únicamente los iconos locales del storefront.');
  }
  const iconPaths = [...source.matchAll(/assets\/icons\/([a-z0-9-]+)\.svg/gi)].map(match => match[1]);
  const unknownIcons = [...new Set(iconPaths)].filter(name => !SOURCE_ICON_NAMES.includes(name));
  if (unknownIcons.length) throw new BadGatewayException(`El sistema visual usa iconos no disponibles: ${unknownIcons.slice(0, 4).join(', ')}.`);
}

export function withSourceStyleTokens(system: SourceVisualSystem, files: SourceProjectFileDto[]): SourceVisualSystem {
  return { ...system, version: SOURCE_VISUAL_SYSTEM_VERSION, tokens: sourceStyleTokens(files) };
}
