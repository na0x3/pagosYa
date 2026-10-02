/** What a photograph actually is, recorded beside it in visual-assets.json.
 *
 * Phase 0 could not stop a store putting a flat cut-out on the card a customer buys from while a
 * better photograph of the same product sat lower down as decoration, because the manifest recorded
 * one flat role and a boilerplate string. No prompt can fix a selection the generator has no data
 * to make. These facts are that data, and every one of them is derived — from upload lineage, from
 * the catalogue, or from the pixels — never invented by a model. */

export const SOURCE_PHOTO_SHOTS = ['packshot', 'scene', 'detail', 'in-use'] as const;
export type SourcePhotoShot = typeof SOURCE_PHOTO_SHOTS[number];

export type SourcePhotoFacts = {
  /** packshot: the goods alone on a seamless backdrop. scene: the same goods staged in a place. */
  shot?: SourcePhotoShot;
  /** Photographs of one catalogue item share a key, so a card can prefer the better of them. */
  productKey?: string;
  /** Up to four colours physically present in the photograph, most-covering first. */
  dominant?: string[];
  /** The colour behind the goods, sampled from the frame's border ring. */
  backdropHex?: string;
  /** Width ÷ height, three decimals. One number per store is the card contract. */
  aspect?: number;
};

const MAX_DOMINANT = 4;
const MAX_PRODUCT_KEY = 64;
const hex = /^#[0-9a-f]{6}$/i;
/** Above this, the border ring is one flat colour and the photograph is a studio cut-out. */
const PACKSHOT_UNIFORMITY = 0.9;
/** Below this, the border ring carries a real place: props, light falloff, a horizon. */
const SCENE_UNIFORMITY = 0.7;

/** Manifest entries survive across revisions and are merchant-visible, so everything read back is
 * re-validated rather than trusted. An entry with nothing usable left is dropped entirely. */
export function normalizeSourcePhotoFacts(value: unknown): SourcePhotoFacts | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const facts: SourcePhotoFacts = {};
  if (typeof raw.shot === 'string' && (SOURCE_PHOTO_SHOTS as readonly string[]).includes(raw.shot)) facts.shot = raw.shot as SourcePhotoShot;
  if (typeof raw.productKey === 'string' && raw.productKey.trim()) facts.productKey = raw.productKey.trim().slice(0, MAX_PRODUCT_KEY);
  if (Array.isArray(raw.dominant)) {
    const colours = [...new Set(raw.dominant.filter((c): c is string => typeof c === 'string' && hex.test(c)).map(c => c.toLowerCase()))].slice(0, MAX_DOMINANT);
    if (colours.length) facts.dominant = colours;
  }
  if (typeof raw.backdropHex === 'string' && hex.test(raw.backdropHex)) facts.backdropHex = raw.backdropHex.toLowerCase();
  if (typeof raw.aspect === 'number' && Number.isFinite(raw.aspect) && raw.aspect > 0) facts.aspect = Math.round(raw.aspect * 1000) / 1000;
  return Object.keys(facts).length ? facts : undefined;
}

/** Lineage is evidence, pixels are only a guess. A scene produced by ProductScenesService is an
 * AI_DERIVED asset whose parent is the packshot it was staged from — that is known, not inferred,
 * so it wins outright. Uniformity decides only the photographs the merchant uploaded themselves,
 * and deliberately says nothing in the middle band rather than guessing wrong. */
export function resolvePhotoShot(input: { kind?: string; hasParent?: boolean; isProductImage?: boolean; uniformity?: number }): SourcePhotoShot | undefined {
  if (input.kind === 'AI_DERIVED' && input.hasParent) return 'scene';
  if (typeof input.uniformity === 'number') {
    if (input.uniformity >= PACKSHOT_UNIFORMITY) return 'packshot';
    if (input.uniformity <= SCENE_UNIFORMITY) return 'scene';
    return undefined;
  }
  return input.isProductImage ? 'packshot' : undefined;
}

export type PhotoLineage = { kind: string; parentUrl: string | null };
export type PhotoDerivationInput = {
  assets: Array<{ url: string; path: string; bytes: Buffer }>;
  /** MediaAsset kind and parent, by upload URL. A scene's parent is the packshot it was staged from. */
  lineage: Map<string, PhotoLineage>;
  /** Catalogue items and every image reference they hold, bundled path or absolute URL. */
  productImages: Array<{ id: string; images: string[] }>;
  samples: Map<string, { dominant: string[]; backdropHex?: string; uniformity?: number }>;
};

/** Assemble one asset's facts from the three sources that actually know something: the upload
 * lineage, the catalogue, and the pixels. An asset nothing is known about gets no entry, so the
 * manifest never carries a row of empty promises the generator might read as meaningful. */
export function derivePhotoFacts(input: PhotoDerivationInput): Record<string, SourcePhotoFacts> {
  const facts: Record<string, SourcePhotoFacts> = {};
  const bundled = new Map(input.assets.map(asset => [asset.url, asset.path]));
  // An image reference matches an upload whether it was rewritten to a bundled path or left absolute.
  const productFor = (url: string | null | undefined) => {
    if (!url) return undefined;
    const path = bundled.get(url);
    return input.productImages.find(item => item.images.some(image => image === path || image === url || image.endsWith(url)))?.id;
  };
  for (const asset of input.assets) {
    const lineage = input.lineage.get(asset.url);
    const sample = input.samples.get(asset.url);
    // A generated scene depicts its parent's product, not one of its own.
    const productKey = productFor(asset.url) ?? productFor(lineage?.parentUrl);
    const entry = normalizeSourcePhotoFacts({
      shot: resolvePhotoShot({ kind: lineage?.kind, hasParent: !!lineage?.parentUrl, isProductImage: !!productKey, uniformity: sample?.uniformity }),
      productKey,
      dominant: sample?.dominant,
      backdropHex: sample?.backdropHex,
      aspect: imageAspect(asset.bytes),
    });
    if (entry) facts[asset.url] = entry;
  }
  return facts;
}

const dimensions = (width: number, height: number) => width > 0 && height > 0 ? { width, height } : undefined;

/** Dimensions come out of the container header, so a 2 MB photograph costs a few dozen bytes to
 * measure. Anything unrecognised returns nothing: a wrong aspect is worse than no aspect, because
 * the card contract compares them. */
export function imageDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  try {
    if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47 && bytes.toString('ascii', 12, 16) === 'IHDR') return dimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
    if (bytes.length >= 10 && bytes.toString('ascii', 0, 3) === 'GIF') return dimensions(bytes.readUInt16LE(6), bytes.readUInt16LE(8));
    if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return webpDimensions(bytes);
    if (bytes.length >= 4 && bytes.readUInt16BE(0) === 0xffd8) return jpegDimensions(bytes);
  } catch { /* truncated or malformed: no aspect */ }
  return undefined;
}

function webpDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  const chunk = bytes.toString('ascii', 12, 16);
  // Lossy: the 14-bit dimensions sit after the 3-byte frame tag and the 3-byte sync code.
  if (chunk === 'VP8 ' && bytes.length >= 30) return dimensions(bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff);
  // Lossless: 14 bits each, packed little-endian right after the 0x2f signature byte.
  if (chunk === 'VP8L' && bytes.length >= 25) { const packed = bytes.readUInt32LE(21); return dimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1); }
  // Extended: 24-bit canvas dimensions, stored as one less than the true size.
  if (chunk === 'VP8X' && bytes.length >= 30) return dimensions(bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1);
  return undefined;
}

/** Walk the marker segments to the frame header. Restart-interval and entropy-table markers carry
 * no dimensions, and the three arithmetic-coded SOF markers are skipped with the rest. */
function jpegDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    const marker = bytes[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return dimensions(bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5));
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    if (marker === 0xda || marker === 0xd9) return undefined; // scan data begins; no frame header found
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  return undefined;
}

export function imageAspect(bytes: Buffer): number | undefined {
  const size = imageDimensions(bytes);
  return size ? Math.round(size.width / size.height * 1000) / 1000 : undefined;
}
