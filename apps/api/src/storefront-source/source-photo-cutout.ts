/* Photo cut-outs (owner 2026-11-10: Bake Me's floating cookie; «model on our server»): the product without its background, as a
 * transparent WebP, from an open background-removal model (u2net-family «silueta», 44 MB, rembg's release) run here with
 * onnxruntime — the merchant's photos never leave pagosYa. A photo that is a scene (nothing clearly in front) gives null. The model
 * file is downloaded once into the uploads folder's sibling «models/» and checked against its SHA-256. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';

export const CUTOUT_MODEL_URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx';
export const CUTOUT_MODEL_SHA256 = '75da6c8d2f8096ec743d071951be73b4a8bc7b3e51d9a6625d63644f90ffeedb';
const SIZE = 320, MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

type Session = { inputNames: readonly string[]; outputNames: readonly string[]; run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>> };
let loading: Promise<Session> | null = null;

async function modelFile(path: string): Promise<Buffer> {
  try { return await readFile(path); } catch { /* fetched below */ }
  const response = await fetch(CUTOUT_MODEL_URL, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`cut-out model download failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== CUTOUT_MODEL_SHA256) throw new Error('cut-out model checksum mismatch');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.part`, bytes); await rename(`${path}.part`, path);
  return bytes;
}

function session(path: string): Promise<Session> {
  loading ??= (async () => {
    const ort = await import('onnxruntime-node');
    return ort.InferenceSession.create(await modelFile(path)) as unknown as Session;
  })().catch(error => { loading = null; throw error; });
  return loading;
}

/** Share of the photo the model keeps as the product; a cut-out is used only between these (a scene keeps almost nothing). */
export const usableCover = (covered: number) => covered >= 0.06 && covered <= 0.85;

export async function photoCutout(input: Buffer, modelPath: string): Promise<Buffer | null> {
  const ort = await import('onnxruntime-node');
  const model = await session(modelPath);
  const { data: rgb, info } = await sharp(input).rotate().resize(1000, 1000, { fit: 'inside', withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const small = await sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } }).resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer();
  const tensor = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) for (let c = 0; c < 3; c++) tensor[c * SIZE * SIZE + i] = (small[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  const result = await model.run({ [model.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, SIZE, SIZE]) });
  const mask = result[model.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity;
  for (const v of mask) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const alpha = Buffer.alloc(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) alpha[i] = Math.round(((mask[i] - lo) / (hi - lo || 1)) * 255);
  const big = await sharp(alpha, { raw: { width: SIZE, height: SIZE, channels: 1 } }).resize(info.width, info.height, { fit: 'fill' }).extractChannel(0).raw().toBuffer();
  let kept = 0;
  for (const v of big) if (v > 128) kept++;
  if (!usableCover(kept / big.length)) return null;
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) { rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = big[i]; }
  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).trim({ threshold: 0 }).webp({ quality: 86, alphaQuality: 90 }).toBuffer();
}

type Item = { photo?: string } & Record<string, unknown>;
type Block = { type: string; photo?: string; photo2?: string; items?: Item[]; cut?: string[] } & Record<string, unknown>;
/** Sections whose product photos float as cut-outs, in the styles that draw them that way. */
export const CUTOUT_SECTIONS = new Set(['cover-mega', 'statement-sticker', 'names-list', 'statement-offset']);
export const CUTOUT_THEMES = new Set(['merienda', 'oliva', 'mimo']);

/** Each photo of those sections replaced by its cut-out (same photo → same cut-out); the block lists the cut-outs it shows. */
export async function withCutouts<B extends Block>(layout: B[], cutOf: (url: string) => Promise<string | null>): Promise<B[]> {
  const memo = new Map<string, Promise<string | null>>();
  const cut = (url?: string) => url ? (memo.get(url) ?? memo.set(url, cutOf(url).catch(() => null)).get(url)!) : Promise.resolve(null);
  return Promise.all(layout.map(async block => {
    if (!CUTOUT_SECTIONS.has(block.type)) return block;
    const [photo, photo2] = await Promise.all([cut(block.photo), cut(block.photo2)]);
    const items = block.items ? await Promise.all(block.items.map(async item => { const c = await cut(item.photo); return c ? { ...item, photo: c } : item; })) : undefined;
    const done = [photo, photo2, ...(items ?? []).map((item, at) => item.photo !== block.items![at].photo ? item.photo : null)].filter((url): url is string => Boolean(url));
    if (!done.length) return block;
    return { ...block, ...(photo ? { photo } : {}), ...(photo2 ? { photo2 } : {}), ...(items ? { items } : {}), cut: done };
  }));
}
