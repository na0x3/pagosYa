import { randomUUID } from 'node:crypto';
import { regenerateSketch, validateDesign } from './design-engine/design-engine';
import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { SourceProjectsService } from './source-projects.service';
import { nextSourceFile } from './source-next';
import { SOURCE_FONT_IDS } from './source-font-catalog';
import { sourceAssetInventory, withSourceIcons } from './source-asset-library';
import { assembleSketch, repairSketch, sketchProductTheme, sketchKitDna, type SketchContext, type StoreSketch } from './sketch';
import { resolveProductTheme, snapshotWithProductTheme } from './product-theme';
import type { SourceProjectSnapshot } from './source-project';
import { patchConfigFile } from './store-look';
import { TOUCH_KEYS } from './kit-touch';

const SKETCH_FILE = 'sketch.json';
const PHOTO = /\.(png|jpe?g|webp|avif)$/i;

/** Boceto mode (sketch-first sub-project 3): hand edits on a sketch-born store. Deterministic and
 * model-free — a PUT repairs whatever arrives, reassembles the store and saves it as a new revision. */
@Injectable()
export class SketchStudioService {
  constructor(private readonly projects: SourceProjectsService, private readonly prisma: PrismaService, private readonly uploads: UploadsService) {}

  private async load(merchantId: string, storeId: string) {
    const current = await this.projects.current(merchantId, storeId);
    const saved = current.revision ? await this.projects.version(merchantId, storeId, current.revision) : null;
    const snapshot = saved?.snapshot as unknown as SourceProjectSnapshot | undefined;
    return { revision: current.revision, snapshot };
  }

  private async context(merchantId: string, storeId: string, snapshot: SourceProjectSnapshot | undefined): Promise<SketchContext> {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { name: true, slug: true } });
    return {
      storeName: store?.name || store?.slug || 'Mi tienda',
      // Same mapping as generation: only an explicit shop sells; portfolio/blog/service never get a forced catalog.
      purpose: (snapshot?.brief as { sitePurpose?: string } | undefined)?.sitePurpose === 'shop' ? 'shop' : 'service',
      // Explicitly confirmed reference/unused uploads never reach the picker; unlabeled photos stay available.
      photos: (() => {
        const files = snapshot?.files ?? [];
        const roles = new Map(sourceAssetInventory(files).map(asset => [asset.path, asset.role]));
        return files.filter(file => PHOTO.test(file.path) && !file.path.startsWith('assets/icons/') && !['reference', 'unused'].includes(roles.get(file.path) ?? '')).map(file => file.path);
      })(),
    };
  }

  /** `stale`: the saved page is not what the current renderer makes of this sketch (it was built before a renderer
   * change, e.g. without the part markers the canvas drags by). The Studio re-saves once so the editor works fully. */
  async get(merchantId: string, storeId: string): Promise<{ revision: number; sketch: StoreSketch | null; photos: string[]; fonts: readonly string[]; stale: boolean }> {
    const { revision, snapshot } = await this.load(merchantId, storeId);
    const stored = snapshot?.files.find(file => file.path === SKETCH_FILE)?.content;
    const ctx = await this.context(merchantId, storeId, snapshot);
    if (!stored) return { revision, sketch: null, photos: ctx.photos, fonts: SOURCE_FONT_IDS, stale: false };
    let parsed: unknown;
    try { parsed = JSON.parse(stored); } catch { parsed = undefined; }
    // Stored sketches re-repair on read, so schema evolutions never break the panel.
    const sketch = repairSketch(parsed, ctx).sketch;
    const saved = new Map((snapshot?.files ?? []).map(file => [file.path, file.content]));
    const stale = assembleSketch(sketch, ctx).some(file => saved.get(file.path) !== file.content);
    return { revision, sketch, photos: ctx.photos, fonts: SOURCE_FONT_IDS, stale };
  }

  /** "Subir foto" in Boceto: a merchant-owned upload becomes a store asset (same checks and naming as generation),
   * saved as a new revision so the photo picker can use it right away. */
  async addPhoto(merchantId: string, storeId: string, input: { revision: number; url: string }): Promise<{ revision: number; path: string; photos: string[] }> {
    const match = /^\/v1\/uploads\/([a-f0-9-]+\.(png|jpe?g|webp))$/i.exec(input.url);
    if (!match) throw new BadRequestException('Elige una foto JPG, PNG o WebP subida a tu tienda.');
    const owned = await this.prisma.mediaAsset.findFirst({ where: { merchantId, url: input.url }, select: { url: true } });
    if (!owned) throw new BadRequestException('Esa foto no pertenece a tu tienda.');
    const { revision, snapshot } = await this.load(merchantId, storeId);
    if (!snapshot || revision !== input.revision) throw new ConflictException('El boceto cambió. Recarga.');
    const bytes = await this.uploads.getBuffer(match[1]);
    if (!bytes) throw new BadRequestException('La foto ya no está disponible. Súbela de nuevo.');
    if (bytes.length > 2_000_000) throw new BadRequestException('Cada foto debe ocupar menos de 2 MB.');
    const path = `assets/image-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.${match[2].toLowerCase()}`;
    let saved = revision;
    let files = snapshot.files;
    if (!files.some(file => file.path === path)) {
      files = [...files, { path, content: bytes.toString('base64'), encoding: 'base64' as const }];
      saved = (await this.projects.save(merchantId, storeId, { revision, label: 'Foto añadida al boceto', brief: snapshot.brief, files })).revision;
    }
    const ctx = await this.context(merchantId, storeId, { ...snapshot, files });
    return { revision: saved, path, photos: ctx.photos };
  }

  async update(merchantId: string, storeId: string, input: { revision: number; sketch: unknown }): Promise<{ revision: number; sketch: StoreSketch }> {
    const { revision, snapshot } = await this.load(merchantId, storeId);
    if (!snapshot || revision !== input.revision) throw new ConflictException('El boceto cambió. Recarga.');
    const ctx = await this.context(merchantId, storeId, snapshot);
    const { sketch: repaired } = repairSketch(input.sketch, ctx);
    const sketch = repaired.design ? validateDesign(repaired, ctx, false).sketch : repaired;
    const assembled = assembleSketch(sketch, ctx);
    const files = await withSourceIcons([
      ...snapshot.files.filter(file => !nextSourceFile(file.path) && file.path !== SKETCH_FILE && file.path !== 'website-design.json'),
      ...assembled,
      { path: SKETCH_FILE, content: JSON.stringify(sketch, null, 2) + '\n' },
    ]);
    const saved = await this.projects.save(merchantId, storeId, { revision: input.revision, label: 'Boceto editado', brief: snapshot.brief, files: await this.withProductTheme(files, sketch) });
    return { revision: saved.revision, sketch };
  }

  async regenerate(merchantId: string, storeId: string, input: { revision: number; designSeed?: string; sectionId?: string }) {
    const loaded = await this.get(merchantId, storeId);
    if (loaded.revision !== input.revision) throw new ConflictException('El boceto cambió. Recarga.');
    if (!loaded.sketch) throw new BadRequestException('Esta tienda ya es un sitio.');
    if (input.sectionId && !loaded.sketch.blocks.some(block => block.id === input.sectionId)) throw new BadRequestException('La sección no existe.');
    const { snapshot } = await this.load(merchantId, storeId);
    const ctx = await this.context(merchantId, storeId, snapshot);
    // update() reloads ownership/context and performs the final atomic revision check.
    const sketch = regenerateSketch(loaded.sketch, ctx, input.designSeed || randomUUID(), input.sectionId);
    return this.update(merchantId, storeId, { revision: input.revision, sketch });
  }

  /** "Generar sitio": the boceto becomes the site, for good. Same deterministic assembly as a Boceto save, saved
   * without sketch.json, so every later save edits the site directly and the Studio leaves the boceto phase. */
  async build(merchantId: string, storeId: string, input: { revision: number }): Promise<{ revision: number }> {
    const { revision, snapshot } = await this.load(merchantId, storeId);
    if (!snapshot || revision !== input.revision) throw new ConflictException('El boceto cambió. Recarga.');
    const stored = snapshot.files.find(file => file.path === SKETCH_FILE)?.content;
    if (!stored) throw new BadRequestException('Esta tienda ya es un sitio.');
    const ctx = await this.context(merchantId, storeId, snapshot);
    let parsed: unknown;
    try { parsed = JSON.parse(stored); } catch { parsed = undefined; }
    const { sketch } = repairSketch(parsed, ctx);
    const files = await withSourceIcons([
      ...snapshot.files.filter(file => !nextSourceFile(file.path) && file.path !== SKETCH_FILE && file.path !== 'website-design.json'),
      ...assembleSketch(sketch, ctx),
    ]);
    const saved = await this.projects.save(merchantId, storeId, { revision, label: 'Sitio generado desde el boceto', brief: snapshot.brief, files: await this.withProductTheme(files, sketch) });
    return { revision: saved.revision };
  }

  /** The sketch's product skin reaches the runtime through config.js dna, like the agent's
   * set_product_card_theme; its composition travels as config.productPageStyle. Every caller rebuilds the home, so the
   * look measured from the old home goes, and so does YAPI's touch (dna.touch = 1) drawn from it: the kit pages show the
   * kit defaults until the next YAPI save measures and touches again (one look per store, spec 2026-10-14). The control
   * language picked for that home goes too (store controls, spec 2026-10-14): the kit's own controls return to their defaults. */
  private async withProductTheme(source: Array<{ path: string; content: string }>, sketch: StoreSketch) {
    const theme = await resolveProductTheme(sketchProductTheme(sketch.product));
    const files = patchConfigFile(source, ({ look: _look, controls: _controls, ...config }) => {
      if (!config.dna || typeof config.dna !== 'object' || config.dna.touch !== 1) return config;
      const dna = { ...config.dna };
      for (const key of ['touch', ...Object.values(TOUCH_KEYS)]) delete dna[key];
      return { ...config, dna };
    });
    return snapshotWithProductTheme({ files }, theme.dna).files.map(file => {
      if (file.path !== 'config.js') return file;
      try {
        const config = JSON.parse(file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)?.[1] ?? '{}');
        const { productAssurances: _previous, ...rest } = config;
        return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...rest, productPageStyle: sketch.product.layout, dna: { ...(config.dna ?? {}), ...sketchKitDna(sketch) }, ...(sketch.product.assurances.length ? { productAssurances: sketch.product.assurances } : {}) })};` };
      } catch { return file; }
    });
  }
}
