import sharp from 'sharp';
import { posix } from 'node:path';
import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import { goodsIcon } from '../source-goods-icon';
import { withKitBaseline, withoutCardRules } from './v2-kit-baseline';

/** The kit's and the library's own classes: the design's sheet never redefines them (owner 2026-11-14, the design kit). */
const KIT_OWNED = /\.es-|\.lb-|\[data-lb/;
import { V2_LIBRARY_FILE, v2LibraryCss, v2LibrarySources } from './v2-library';

/** V2 prototype (docs/superpowers/specs/2026-11-14-v2-prototype-design.md §1): what the designer may know about the store, read
 *  from the base revision's own files — the same config.js data the kit draws from. Prices and stock are left out on purpose:
 *  the kit draws them at runtime; the design never writes them. */
/** A product's photo without its background (owner 2026-11-15, the showcase pieces), bundled as assets/image-<hash>.webp. */
/** what: what YAPI saw in it («lata Lemon · Ginger»), so a stage screen is named after what it shows. */
export type V2Cutout = { path: string; product: string; name: string; width: number; height: number; what?: string };
/** product: the photo is a copy of that product's own photo (same picture, another file), so it already shows in its card. */
export type V2Photo = { path: string; width: number; height: number; shape: 'wide' | 'tall' | 'square'; product?: string };
export type V2Product = { id: string; name: string; category: string; about: string; photos: number };
export type V2Context = {
  storeName: string; tagline: string; about: string; request: string; checkoutMode: string;
  categories: string[]; products: V2Product[]; photos: V2Photo[];
  /** Real places (name · address · description) for a «visit us» section; WhatsApp when the store offers it. */
  places: string[]; whatsapp: boolean;
  /** Active packs (live 2026-11-14: Pawby V2 drew an empty «Packs» section for a store with none). */
  packs: number;
  /** The merchant asked for product cards of their own design (owner 2026-11-14): the design styles the card; otherwise the
   *  platform's card (v2-kit-baseline V2_CARD_SHEET) is kept and the design's card rules are taken out. */
  ownCards: boolean;
  /** Owner 2026-11-14 («the icons are the same up top, like little shirt, search button and create profile, unless asked to
   *  change»): the header shows search · profile · the cart drawn as what the store sells (`goods`, '' = bag) — the design's own
   *  header icons only when the merchant asked for them (`ownIcons`). */
  goods: string; ownIcons: boolean;
  /** Free mode (YAPI_V2_FREE, owner 2026-11-14): the writer composes the whole home; the library is optional; only real breakage blocks. */
  free?: boolean;
  /** The cart drawer's look for this store (v2-kit-baseline v2CartSheet), set once the direction chose it. */
  cartSheet?: string;
  /** An animated store (owner 2026-11-14): motion is the brand's signature — asked in words or by the route. */
  animated?: boolean;
  /** Product cut-outs for the showcase pieces (ProductStage, HangingRail), when the build made them. */
  cutouts?: V2Cutout[];
};

/** A request that asks for the header icons themselves to change («cambia los íconos», «otro ícono del carrito»). */
// No \b before «í»: JavaScript's word boundary treats accented letters as non-word characters.
export const OWN_ICONS_REQUEST = /\b(cambia|cambiar|otros?|distintos?|personaliza|rediseña)\b[^.]{0,30}(?<![a-z])[ií]conos?\b|(?<![a-z])[ií]conos?\b[^.]{0,30}\b(cabecera|header|men[uú]|carrito|bolsa|perfil|cuenta)\b/i;

/** A request that asks for the product cards themselves to be designed («cambia las tarjetas», «tarjetas de producto distintas»). */
/** A request for a store that moves («tienda animada», «con movimiento», «que se mueva», «interactiva»). */
export const ANIMATED_REQUEST = /\b(animad[ao]s?|animaci[oó]n(es)?|con movimiento|que se mueva|interactiv[ao]s?)\b/i;

export const OWN_CARDS_REQUEST = /\b(tarjetas?|cards?)\b[^.]{0,40}\b(productos?|tienda)\b|\b(cambia|rediseña|personaliza|diseña|otras?|distintas?)\b[^.]{0,30}\btarjetas?\b/i;

/** The four files a V2 design writes. Shell keeps the export contract every platform page imports (default Shell, Header, Footer). */
export const V2_FILES = ['components/Shell.tsx', 'components/home.tsx', 'components/product.tsx', 'styles/globals.css'] as const;
/** …plus the platform's generated components/v2-library.tsx when the home places library sections (spec 2026-11-14). */
export type V2File = { path: typeof V2_FILES[number] | 'components/v2-library.tsx'; content: string };

export function readConfigData(files: readonly SourceProjectFileDto[]): Record<string, any> {
  const content = files.find(file => file.path === 'config.js')?.content ?? '';
  const match = content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
  try { return match ? JSON.parse(match[1]) : {}; } catch { return {}; }
}

/** Live 2026-11-15 (Oh Belly r22: «Hablemos» stood empty): the design is built from an old template revision whose config.js still
 *  said contactFormEnabled false after the store turned the form on, and the runtime hides the form's slot. The store's own
 *  settings win over the copy in config.js. */
export function withStoreSettings<T extends SourceProjectFileDto>(files: readonly T[], settings: { contactFormEnabled: boolean }): T[] {
  return files.map(file => {
    if (file.path !== 'config.js') return file;
    const config = readConfigData([file]);
    if (!config.data || config.data.contactFormEnabled === settings.contactFormEnabled) return file;
    return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, data: { ...config.data, contactFormEnabled: settings.contactFormEnabled } })};` };
  });
}

export async function v2Context(files: readonly SourceProjectFileDto[], request: string): Promise<V2Context> {
  const config = readConfigData(files);
  const data = (config.data ?? {}) as Record<string, any>;
  const categories = new Map<string, string>(((data.categories ?? []) as Array<{ id: string; name: string }>).map(category => [category.id, category.name]));
  const products = ((data.items ?? []) as Array<Record<string, any>>).map((item): V2Product => ({
    id: String(item.id), name: String(item.name ?? ''), category: categories.get(item.categoryId) ?? '',
    about: String(item.description ?? '').replace(/\s+/g, ' ').slice(0, 240), photos: Array.isArray(item.imageUrls) ? item.imageUrls.length : 0,
  }));
  const photos: V2Photo[] = [];
  for (const file of files) {
    if (!/^assets\/[\w.-]+\.(?:jpe?g|png|webp)$/i.test(file.path) || file.encoding !== 'base64') continue;
    const meta = await sharp(Buffer.from(file.content, 'base64')).metadata().catch(() => null);
    if (!meta?.width || !meta.height) continue;
    const ratio = meta.width / meta.height;
    photos.push({ path: file.path, width: meta.width, height: meta.height, shape: ratio > 1.2 ? 'wide' : ratio < 0.83 ? 'tall' : 'square' });
  }
  return {
    storeName: String(data.storeName ?? ''), tagline: String(data.tagline ?? ''), about: String(data.aboutText ?? '').slice(0, 600),
    request: request.slice(0, 1500), checkoutMode: String(data.checkoutMode ?? ''), categories: [...categories.values()], products, photos,
    places: ((data.locations ?? []) as Array<Record<string, unknown>>).map(place => [place.name, place.address, place.description].filter(Boolean).map(String).join(' · ').slice(0, 240)),
    whatsapp: data.whatsappButton === true,
    packs: data.bundlesEnabled === false ? 0 : Array.isArray(data.bundles) ? data.bundles.length : 0,
    ownCards: OWN_CARDS_REQUEST.test(request),
    animated: ANIMATED_REQUEST.test(request),
    goods: goodsIcon([...products.map(product => product.name), ...categories.values()], String(data.storeName ?? '')),
    ownIcons: OWN_ICONS_REQUEST.test(request),
  };
}

/** A store photo as a small JPEG data URL for a vision call (never the original bytes). */
export async function photoDataUrl(files: readonly SourceProjectFileDto[], path: string, width = 768): Promise<string | null> {
  const file = files.find(entry => entry.path === path && entry.encoding === 'base64');
  if (!file) return null;
  const jpeg = await sharp(Buffer.from(file.content, 'base64')).resize({ width, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer().catch(() => null);
  return jpeg ? `data:image/jpeg;base64,${jpeg.toString('base64')}` : null;
}

const importsOf = (content: string) => [...content.matchAll(/^\s*import[\s\S]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm)].map(match => match[1]);
const resolve = (from: string, specifier: string) => {
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  return /\.tsx$/.test(base) ? base : `${base}.tsx`;
};

/** The base store with the V2 design in place of the template's: the four written files replace their namesakes; every other
 *  component the template brought is dropped unless a page the platform owns (or a kept page) still imports it. Runtime files,
 *  photos, config and the platform's own pages stay as they are. Compiled output is left out — the sandbox builds it again. */
export function assembleV2Files(base: readonly SourceProjectFileDto[], written: readonly V2File[], ownCards = false, ownIcons = false, cartSheet = ''): SourceProjectFileDto[] {
  // Library sections (spec 2026-11-14): a home that places them gets the library's code fresh from the template package (a store's
  // own copy may predate LibraryBlockView) and its styles after the design's sheet, in the design's tokens.
  const usesLibrary = written.some(file => file.path === V2_LIBRARY_FILE) && written.some(file => /from\s+['"]\.\/v2-library['"]/.test(file.content));
  const fresh = usesLibrary ? v2LibrarySources() : [];
  const replaced = new Set<string>([...written.map(file => file.path), ...fresh.map(file => file.path)]);
  const source = [...base.filter(file => !file.path.startsWith('_compiled/') && !replaced.has(file.path)), ...fresh];
  const components = source.filter(file => /^components\/.+\.tsx$/.test(file.path));
  const platform = (file: SourceProjectFileDto) => /^\/\/ @pagosya-(?:page|catalog-page)\b/.test(file.content) || file.path === 'components/checkout.tsx';
  const keep = new Set<string>();
  const visit = (path: string, content: string) => {
    for (const specifier of importsOf(content)) {
      const target = resolve(path, specifier);
      if (keep.has(target) || written.some(file => file.path === target)) continue;
      const file = components.find(entry => entry.path === target);
      if (file) { keep.add(target); visit(file.path, file.content); }
    }
  };
  for (const file of components.filter(platform)) { keep.add(file.path); visit(file.path, file.content); }
  for (const file of written) visit(file.path, file.content);
  // The kit's own parts keep sane sizes whatever the design writes, and the product card is the platform's (v2-kit-baseline).
  return [...source.filter(file => !/^components\/.+\.tsx$/.test(file.path) || keep.has(file.path)),
    ...written.map(file => ({ path: file.path, content: file.path === 'styles/globals.css' ? `${withKitBaseline(usesLibrary ? `${withoutCardRules(file.content, KIT_OWNED)}\n${v2LibraryCss()}` : file.content, ownCards, ownIcons)}${cartSheet && !file.content.includes('v2:cart') ? `\n${cartSheet}` : ''}` : file.content }))];
}
