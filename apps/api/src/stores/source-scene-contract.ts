import { createHash } from 'node:crypto';
import type { SourceStyleTokens } from './source-style-tokens';
import type { SourceProductPageStyle } from './source-design';

/** The photographic scene contract from docs/STOREFRONT_DESIGN_LEVEL_UP.md §5.
 *
 * A store resolves one backdrop colour, one light direction, one camera elevation, one
 * product-fill fraction and one aspect ratio, persists them beside its design tokens, and every
 * later scene generation reuses them. Before this, productScenePrompt() asked for "a clean
 * seamless studio backdrop in a color that suits the brand" once per product and the model
 * resolved that to neutral grey every time, so a catalog read as a bag of stock photos. */

export const PRODUCT_SCENE_ASPECTS = ['square', 'portrait', 'landscape'] as const;
export type ProductSceneAspect = (typeof PRODUCT_SCENE_ASPECTS)[number];

export const SCENE_BACKDROP_MODES = ['paper', 'field'] as const;
export const SCENE_LIGHT_DIRECTIONS = ['left-45', 'right-45', 'top-soft', 'window-left'] as const;
export const SCENE_CAMERA_ELEVATIONS = ['eye-level', 'three-quarter', 'overhead'] as const;
export const SCENE_SHADOWS = ['soft-contact', 'long-directional', 'none'] as const;
/** Product height divided by frame height. Outside this band the product either floats or crowds. */
export const SCENE_FILL_FRACTION = { min: 0.62, max: 0.72 } as const;
/** Whole percents of frame height, so the emitted prompt never carries a rounding artefact. */
export const SCENE_FILL_STEPS = [0.62, 0.65, 0.68, 0.7, 0.72] as const;

export type SourceSceneContract = {
  backdropHex: string;
  backdropMode: (typeof SCENE_BACKDROP_MODES)[number];
  lightDirection: (typeof SCENE_LIGHT_DIRECTIONS)[number];
  cameraElevation: (typeof SCENE_CAMERA_ELEVATIONS)[number];
  fillFraction: number;
  aspect: ProductSceneAspect;
  shadow: (typeof SCENE_SHADOWS)[number];
};

/** A 45-degree key light throws a long shadow; a soft or window light lands as a contact shadow. */
const SHADOW_FOR_LIGHT: Record<(typeof SCENE_LIGHT_DIRECTIONS)[number], (typeof SCENE_SHADOWS)[number]> = {
  'left-45': 'long-directional', 'right-45': 'long-directional', 'top-soft': 'soft-contact', 'window-left': 'soft-contact',
};

function normalizeHex(value: string | null | undefined): string | null {
  const raw = (value || '').trim().toLowerCase();
  if (/^#[\da-f]{3}$/.test(raw)) return '#' + [...raw.slice(1)].map(digit => digit + digit).join('');
  return /^#[\da-f]{6}$/.test(raw) ? raw : null;
}

/** Resolve once from the store's own resolved identity. Light, camera and fill are derived from a
 * stable fingerprint of that identity rather than chosen at random, so the same store always gets
 * the same shoot and two stores rarely get the same one. Never a platform default look. */
export function resolveSourceSceneContract(tokens: SourceStyleTokens, productPageStyle?: SourceProductPageStyle): SourceSceneContract | null {
  // backdropMode 'paper' means the packshot dissolves into the page; without the store's own paper
  // there is no honest backdrop to name, and an unresolved contract is better than an invented one.
  const backdropHex = normalizeHex(tokens.background?.resolved) ?? normalizeHex(tokens.surface?.resolved);
  if (!backdropHex) return null;
  const identity = (['background', 'foreground', 'accent', 'heading-font', 'radius'] as const)
    .map(name => tokens[name]?.resolved ?? tokens[name]?.authored ?? '').join('|');
  const fingerprint = createHash('sha256').update(identity).digest();
  const pick = <T>(list: readonly T[], byte: number): T => list[fingerprint[byte] % list.length];
  const lightDirection = pick(SCENE_LIGHT_DIRECTIONS, 0);
  return {
    backdropHex,
    backdropMode: 'paper',
    lightDirection,
    cameraElevation: pick(SCENE_CAMERA_ELEVATIONS, 1),
    fillFraction: pick(SCENE_FILL_STEPS, 2),
    // Editorial product pages carry tall imagery; dense specification pages read better square.
    aspect: productPageStyle === 'editorial' ? 'portrait' : 'square',
    shadow: SHADOW_FOR_LIGHT[lightDirection],
  };
}

/** A persisted contract is JSON a human may have edited. Anything outside the documented
 * vocabulary or the fill band is dropped rather than sent to the image model. */
export function normalizeSourceSceneContract(value: unknown): SourceSceneContract | null {
  const candidate = value as Partial<SourceSceneContract> | null | undefined;
  const backdropHex = normalizeHex(candidate?.backdropHex);
  if (!backdropHex || typeof candidate?.fillFraction !== 'number'
    || candidate.fillFraction < SCENE_FILL_FRACTION.min || candidate.fillFraction > SCENE_FILL_FRACTION.max
    || !SCENE_BACKDROP_MODES.includes(candidate.backdropMode!) || !SCENE_LIGHT_DIRECTIONS.includes(candidate.lightDirection!)
    || !SCENE_CAMERA_ELEVATIONS.includes(candidate.cameraElevation!) || !SCENE_SHADOWS.includes(candidate.shadow!)
    || !PRODUCT_SCENE_ASPECTS.includes(candidate.aspect!)) return null;
  return { backdropHex, backdropMode: candidate.backdropMode!, lightDirection: candidate.lightDirection!,
    cameraElevation: candidate.cameraElevation!, fillFraction: candidate.fillFraction, aspect: candidate.aspect!, shadow: candidate.shadow! };
}

/** Emitted verbatim inside productScenePrompt(); §5 fixes this wording. */
export function sceneContractPrompt(contract: SourceSceneContract): string {
  return `Seamless backdrop in exactly ${contract.backdropHex}. Key light ${contract.lightDirection}. Camera ${contract.cameraElevation}. The product occupies ${Math.round(contract.fillFraction * 100)}% of the frame height, centred, with even margin. ${contract.shadow} shadow. Every photograph for this store uses these same values so the catalogue reads as one shoot.`;
}
