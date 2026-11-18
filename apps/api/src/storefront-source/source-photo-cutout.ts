/* Photo cut-outs (owner 2026-11-10: Bake Me's floating cookie; «model on our server»): the product without its background, as a
 * transparent WebP, from an open background-removal model (u2net-family «silueta», 44 MB, rembg's release) run here with
 * onnxruntime — the merchant's photos never leave pagosYa. A photo that is a scene (nothing clearly in front) gives null. The model
 * file is downloaded once into the uploads folder's sibling «models/» and checked against its SHA-256. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import sharp from 'sharp';

export const CUTOUT_MODEL_URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx';
export const CUTOUT_MODEL_SHA256 = '75da6c8d2f8096ec743d071951be73b4a8bc7b3e51d9a6625d63644f90ffeedb';
/** The models by file name: silueta (small, 320 px — the template sections) and isnet-general-use (rembg's, 1024 px, 179 MB — the V2
 *  showcase cut-outs; owner 2026-11-15 «sometimes it cuts it out not good»: silueta lost dark suits, trains and flowers, kept
 *  stickers around the product). */
const MODELS: Record<string, { url: string; sha256: string; size: number; mean: number[]; std: number[] }> = {
  'silueta.onnx': { url: CUTOUT_MODEL_URL, sha256: CUTOUT_MODEL_SHA256, size: 320, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
  'isnet-general-use.onnx': { url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx', sha256: '60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a', size: 1024, mean: [0.5, 0.5, 0.5], std: [1, 1, 1] },
};
const spec = (path: string) => MODELS[basename(path)] ?? MODELS['silueta.onnx'];

type Session = { inputNames: readonly string[]; outputNames: readonly string[]; run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>> };
const loading = new Map<string, Promise<Session>>();

async function modelFile(path: string): Promise<Buffer> {
  try { return await readFile(path); } catch { /* fetched below */ }
  const { url, sha256 } = spec(path);
  const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
  if (!response.ok) throw new Error(`cut-out model download failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('cut-out model checksum mismatch');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.part`, bytes); await rename(`${path}.part`, path);
  return bytes;
}

function session(path: string): Promise<Session> {
  if (!loading.has(path)) loading.set(path, (async () => {
    const ort = await import('onnxruntime-node');
    return ort.InferenceSession.create(await modelFile(path)) as unknown as Session;
  })().catch(error => { loading.delete(path); throw error; }));
  return loading.get(path)!;
}

/** Share of the photo the model keeps as the product; a cut-out is used only between these (a scene keeps almost nothing). */
export const usableCover = (covered: number) => covered >= 0.06 && covered <= 0.85;

/** The photo at most 1000 px and the model's mask for it, same size (0 background … 255 product). */
async function maskOf(input: Buffer, modelPath: string) {
  const ort = await import('onnxruntime-node');
  const model = await session(modelPath);
  const { size: SIZE, mean: MEAN, std: STD } = spec(modelPath);
  const { data: rgb, info } = await sharp(input).rotate().resize(1000, 1000, { fit: 'inside', withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const small = await sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } }).resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer();
  const tensor = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) for (let c = 0; c < 3; c++) tensor[c * SIZE * SIZE + i] = (small[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  const result = await model.run({ [model.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, SIZE, SIZE]) });
  const mask = result[model.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < SIZE * SIZE; i++) { const v = mask[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const alpha = Buffer.alloc(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) alpha[i] = Math.round(((mask[i] - lo) / (hi - lo || 1)) * 255);
  const big = await sharp(alpha, { raw: { width: SIZE, height: SIZE, channels: 1 } }).resize(info.width, info.height, { fit: 'fill' }).extractChannel(0).raw().toBuffer();
  return { rgb, width: info.width, height: info.height, alpha: big };
}

async function cutWith(rgb: Buffer, width: number, height: number, alpha: Buffer) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) { rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = alpha[i]; }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).trim({ threshold: 0 }).webp({ quality: 86, alphaQuality: 90 }).toBuffer();
}

export async function photoCutout(input: Buffer, modelPath: string): Promise<Buffer | null> {
  const { rgb, width, height, alpha } = await maskOf(input, modelPath);
  let kept = 0;
  for (const v of alpha) if (v > 128) kept++;
  if (!usableCover(kept / alpha.length)) return null;
  return cutWith(rgb, width, height, alpha);
}

export type CutoutReject = 'cover' | 'top' | 'side' | 'ghost';
/** A mask made fit to float on a plain colour (owner 2026-11-15, the stage's bad cut-outs, tuned on NOA/Oh Belly/DooBoo's 45 photos):
 *  loose bits away from the product go (stickers, splashes — any part under 8% of the largest one, and soft pixels not next to a kept
 *  part); then it is refused when the frame cuts it — solid along the top edge (legs without a body, an arm coming down) or a side
 *  (a hand holding the cup, a shelf, a pile of cans) — or when much of it is see-through (a faded shelf row, a drawing). The bottom
 *  edge is fine: things stand on it. */
export function cleanMask(alpha: Buffer, width: number, height: number): { alpha: Buffer; reject?: CutoutReject } {
  const solid = (i: number) => alpha[i] > 128;
  const label = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < width * height; start++) {
    if (!solid(start) || label[start] >= 0) continue;
    const id = sizes.length; let count = 0; label[start] = id; stack.push(start);
    while (stack.length) {
      const i = stack.pop()!; count++;
      const x = i % width, y = (i - x) / width;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1])
        if (j >= 0 && label[j] < 0 && solid(j)) { label[j] = id; stack.push(j); }
    }
    sizes.push(count);
  }
  if (!sizes.length) return { alpha, reject: 'cover' };
  const largest = Math.max(...sizes);
  const keep = sizes.map(count => count >= largest * 0.08);
  const near = (i: number) => {
    const x = i % width, y = (i - x) / width;
    for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < width && yy < height && label[yy * width + xx] >= 0 && keep[label[yy * width + xx]]) return true;
    }
    return false;
  };
  const out = Buffer.from(alpha);
  for (let i = 0; i < width * height; i++) if (label[i] >= 0 ? !keep[label[i]] : alpha[i] > 0 && !near(i)) out[i] = 0;
  const share = (cells: number[]) => cells.filter(i => out[i] > 128).length / cells.length;
  const row = (y: number) => Array.from({ length: width }, (_, x) => y * width + x);
  const column = (x: number) => Array.from({ length: height }, (_, y) => y * width + x);
  let seen = 0, soft = 0, kept = 0;
  for (const v of out) { if (v > 16) { seen++; if (v < 200) soft++; } if (v > 128) kept++; }
  const reject: CutoutReject | undefined = !usableCover(kept / out.length) ? 'cover'
    : Math.max(share(row(0)), share(row(1))) > 0.02 ? 'top'
    : Math.max(share(column(0)), share(column(1)), share(column(width - 1)), share(column(width - 2))) > 0.04 ? 'side'
    : soft / (seen || 1) > 0.25 ? 'ghost' : undefined;
  return { alpha: out, ...(reject ? { reject } : {}) };
}

/** The product cut out for the V2 showcase pieces (the stage, the rail): the stronger model, its loose bits removed, refused with
 *  the reason when the frame cuts it or it is see-through. */
export async function productCutout(input: Buffer, modelPath: string): Promise<{ cut: Buffer | null; reject?: CutoutReject }> {
  const { rgb, width, height, alpha } = await maskOf(input, modelPath);
  const clean = cleanMask(alpha, width, height);
  if (clean.reject) return { cut: null, reject: clean.reject };
  return { cut: await cutWith(rgb, width, height, clean.alpha) };
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
