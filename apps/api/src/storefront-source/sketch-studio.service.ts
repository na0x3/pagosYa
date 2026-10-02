import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SourceProjectsService } from './source-projects.service';
import { nextSourceFile } from './source-next';
import { SOURCE_FONT_IDS } from './source-font-catalog';
import { assembleSketch, repairSketch, type SketchContext, type StoreSketch } from './sketch';
import type { SourceProjectSnapshot } from './source-project';

const SKETCH_FILE = 'sketch.json';
const PHOTO = /\.(png|jpe?g|webp|avif)$/i;

/** Boceto mode (sketch-first sub-project 3): hand edits on a sketch-born store. Deterministic and
 * model-free — a PUT repairs whatever arrives, reassembles the store and saves it as a new revision. */
@Injectable()
export class SketchStudioService {
  constructor(private readonly projects: SourceProjectsService, private readonly prisma: PrismaService) {}

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
      purpose: (snapshot?.brief as { sitePurpose?: string } | undefined)?.sitePurpose === 'service' ? 'service' : 'shop',
      photos: (snapshot?.files ?? []).filter(file => PHOTO.test(file.path)).map(file => file.path),
    };
  }

  async get(merchantId: string, storeId: string): Promise<{ revision: number; sketch: StoreSketch | null; photos: string[]; fonts: readonly string[] }> {
    const { revision, snapshot } = await this.load(merchantId, storeId);
    const stored = snapshot?.files.find(file => file.path === SKETCH_FILE)?.content;
    const ctx = await this.context(merchantId, storeId, snapshot);
    if (!stored) return { revision, sketch: null, photos: ctx.photos, fonts: SOURCE_FONT_IDS };
    let parsed: unknown;
    try { parsed = JSON.parse(stored); } catch { parsed = undefined; }
    // Stored sketches re-repair on read, so schema evolutions never break the panel.
    return { revision, sketch: repairSketch(parsed, ctx).sketch, photos: ctx.photos, fonts: SOURCE_FONT_IDS };
  }

  async update(merchantId: string, storeId: string, input: { revision: number; sketch: unknown }): Promise<{ revision: number; sketch: StoreSketch }> {
    const { revision, snapshot } = await this.load(merchantId, storeId);
    if (!snapshot || revision !== input.revision) throw new ConflictException('El boceto cambió. Recarga.');
    const ctx = await this.context(merchantId, storeId, snapshot);
    const { sketch } = repairSketch(input.sketch, ctx);
    const assembled = assembleSketch(sketch, ctx);
    const files = [
      ...snapshot.files.filter(file => !nextSourceFile(file.path) && file.path !== SKETCH_FILE),
      ...assembled,
      { path: SKETCH_FILE, content: JSON.stringify(sketch, null, 2) + '\n' },
    ];
    const saved = await this.projects.save(merchantId, storeId, { revision: input.revision, label: 'Boceto editado', brief: snapshot.brief, files });
    return { revision: saved.revision, sketch };
  }
}
