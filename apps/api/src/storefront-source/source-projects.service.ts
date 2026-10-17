import { sourceRequestContext } from './source-request-context';
import { withoutCommerceTemplates } from './commerce-surfaces/surface-inject';
import { FRAME_DRAW_FILE, parseFrameDraw, type FrameDraw } from './design-engine/frame-draw';
import { visibleSentences } from './copy-check';
import { readVoice, VOICE_FILE, type RecentVoice } from './store-voice';
import { readControls } from './store-controls';
import type { RecentControls } from './store-controls-library';
import { isSignatureDevice, type ShownStyleCard } from './design-engine/style-draws';
import { SOURCE_FONT_CATALOG } from './source-font-catalog';
/** Another merchant's display font enters a prompt only when it is a catalogue id. */
const FONT_IDS = new Set<string>(SOURCE_FONT_CATALOG.map(font => font.id));
import { assertPreparedSource, type PreparedSourceArtifact } from './source-prepared-artifact';
import { DesignRetryableConflict } from './source-design-errors';
import { savedSourceVisualSystem, withSourceStyleTokens, SOURCE_VISUAL_SYSTEM_FILE } from './source-visual-system';
import { sourceSitePurpose } from './source-site-purpose';
import { compileNextPreview, isNextSource, nextSourceFile, nextProjectExport } from './source-next';
import { normalizeProductVariants, totalVariantStock, type ProductVariant } from '../payment-links/product-variants';
import { applyVariantOperations } from './source-product-options';
import { applyProductSubscriptionOperations, validateProductSubscriptions } from '../payment-links/product-subscriptions';
import { readFile } from 'node:fs/promises';
import { withStandardPages } from './source-content-pages';
import { withRefreshedStaticStandardPages, withShowcaseAccountPages, withStaticStandardPages } from './source-static-pages';
import { currentSourceRuntime } from './source-runtime';
import { publicationState } from './source-publishing.service';
import { withSourceMotionSettings, type SourceMotionMode, type SourceScrollFeel } from './source-motion';
import { applySourceLayoutBaseline } from './source-layout-baseline';
import { withSourceFonts } from './source-fonts';
import { savedSourceDesign } from './source-design';
import { compositionFingerprint } from './source-composition-plan';
import { dnaFingerprint } from './source-dna';
import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PaymentLinkStatus, Prisma, type PaymentLink } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UploadsService } from "../uploads/uploads.service";
import { EditSourceFileDto, SaveSourceProjectDto } from "./dto/save-source-project.dto";
import { validateLegacySources } from './source-legacy';
import { applySourceKitCss, SOURCE_KIT_CSS_PATH } from './source-kit-css';
import { withSanitizedMotifs } from './source-motifs';
import { sourceProjectArchive, sourceProjectDigest, sourceProjectSnapshot, SourceProjectSnapshot } from "./source-project";
import type { SourceProduct, SourceProductOperation } from './source-products';
import { kitPath } from '@pagosya/storefront-kit';
import { applySourceVisualEdit, sourceVisualFields } from './source-visual-edit';
import type { SourceVisualEditDto } from './dto/source-visual-edit.dto';

type GenerationSave = { id: string; prepared?: PreparedSourceArtifact; enablePayments?: boolean; products?: SourceProduct[]; productOperations?: SourceProductOperation[]; data: Prisma.StoreSourceGenerationUpdateManyMutationInput };
const summarySelect = { revision: true, label: true, digest: true, restoredFrom: true, createdAt: true } as const;
/** Cross-store memory window (sub-project 4): recent enough to matter, small enough to stay one cheap indexed read. */
const RECENT_DESIGN_DAYS = 60;
const RECENT_DESIGN_LIMIT = 40;

/** The chosen concept's DNA fingerprint, or null when the revision carries no design with a DNA. */
function snapshotDesignFingerprint(files: SourceProjectSnapshot['files']): string | null {
  const design = savedSourceDesign(files);
  const dna = design?.concepts[design.selected]?.dna;
  return dna ? dnaFingerprint(dna) : null;
}

@Injectable()
export class SourceProjectsService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly uploads?: UploadsService) {}

  private async ownedStore(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, slug: true } });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }

  /** Fingerprints other stores used recently, newest first and distinct. Selects only the fingerprint column. */
  async recentDesignFingerprints(storeId: string, now = new Date()): Promise<string[]> {
    const rows = await this.prisma.storeSourceVersion.findMany({
      where: { storeId: { not: storeId }, designFingerprint: { not: null }, createdAt: { gte: new Date(now.getTime() - RECENT_DESIGN_DAYS * 86_400_000) } },
      orderBy: { createdAt: 'desc' }, take: RECENT_DESIGN_LIMIT, select: { designFingerprint: true },
    });
    return [...new Set(rows.flatMap(row => row.designFingerprint ? [row.designFingerprint] : []))];
  }

  /** Read only the small design manifest in PostgreSQL, never transfer bundled
   * photo bytes or return another merchant's copy/assets to the planner. */
  async recentCompositionFingerprints(storeId: string, now = new Date()): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ content: string }>>(Prisma.sql`
      SELECT f->>'content' AS content
      FROM (
        SELECT v.snapshot FROM "StoreSourceVersion" v
        WHERE v."storeId" <> ${storeId}
          AND v."createdAt" >= ${new Date(now.getTime() - RECENT_DESIGN_DAYS * 86_400_000)}
        ORDER BY v."createdAt" DESC LIMIT ${RECENT_DESIGN_LIMIT}
      ) recent,
      LATERAL jsonb_array_elements(recent.snapshot->'files') f
      WHERE f->>'path' = ${'design-direction.json'}
        AND COALESCE(f->>'encoding', 'utf8') <> 'base64'
    `);
    const fingerprints = rows.flatMap(row => {
      const design = savedSourceDesign([{ path: 'design-direction.json', content: row.content }]);
      const concept = design?.concepts[design.selected];
      return concept?.composition ? [compositionFingerprint({ composition: concept.composition })] : [];
    });
    return [...new Set(fingerprints)];
  }

  /** The frame draws of the six most recent other stores (30 days), read server-side so no bundled photo bytes travel. */
  async recentFrameDraws(storeId: string, now = new Date(), limit = 6): Promise<ReturnType<typeof parseFrameDraw>[]> {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const rows = await this.prisma.$queryRaw<Array<{ content: string }>>(Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON (v."storeId") v."storeId", v.revision, v."createdAt"
        FROM "StoreSourceVersion" v
        WHERE v."storeId" <> ${storeId} AND v."createdAt" >= ${since}
        ORDER BY v."storeId", v."createdAt" DESC
      ), top AS (SELECT * FROM latest ORDER BY "createdAt" DESC LIMIT ${limit})
      SELECT f->>'content' AS content
      FROM top JOIN "StoreSourceVersion" v ON v."storeId" = top."storeId" AND v.revision = top.revision,
      LATERAL jsonb_array_elements(v.snapshot->'files') f
      WHERE f->>'path' = ${FRAME_DRAW_FILE}
    `);
    return rows.map(row => parseFrameDraw(row.content)).filter(draw => Object.keys(draw).length > 0);
  }

  /** The control languages of recent other stores (spec 2026-10-14 store controls): each store's latest revision in 30 days,
   *  newest first, with the business kind its frame draw recorded. Read-only; a revision without a usable record is left out. */
  async recentControls(storeId: string, now = new Date(), limit = 40): Promise<RecentControls[]> {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const rows = await this.prisma.$queryRaw<Array<{ config: string | null; draw: string | null }>>(Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON (v."storeId") v."storeId", v.revision, v."createdAt"
        FROM "StoreSourceVersion" v
        WHERE v."storeId" <> ${storeId} AND v."createdAt" >= ${since}
        ORDER BY v."storeId", v."createdAt" DESC
      ), top AS (SELECT * FROM latest ORDER BY "createdAt" DESC LIMIT ${limit})
      SELECT
        (SELECT f->>'content' FROM jsonb_array_elements(v.snapshot->'files') f WHERE f->>'path' = ${'config.js'} LIMIT 1) AS config,
        (SELECT f->>'content' FROM jsonb_array_elements(v.snapshot->'files') f WHERE f->>'path' = ${FRAME_DRAW_FILE} LIMIT 1) AS draw
      FROM top JOIN "StoreSourceVersion" v ON v."storeId" = top."storeId" AND v.revision = top.revision
      ORDER BY top."createdAt" DESC
    `);
    return rows.flatMap(row => {
      const controls = row.config ? readControls([{ path: 'config.js', content: row.config }]) : undefined;
      const kind = parseFrameDraw(row.draw).kind;
      return controls ? [{ ...(kind ? { kind } : {}), controls }] : [];
    });
  }

  /** The voice sheets and home sentences of recent other stores (spec 2026-10-14 store voice): each store's latest revision in
   *  30 days, newest first, with the business kind its frame draw recorded. Read-only; only three small text files travel. */
  async recentVoices(storeId: string, now = new Date(), limit = 12): Promise<RecentVoice[]> {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const rows = await this.prisma.$queryRaw<Array<{ voice: string | null; draw: string | null; home: string | null }>>(Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON (v."storeId") v."storeId", v.revision, v."createdAt"
        FROM "StoreSourceVersion" v
        WHERE v."storeId" <> ${storeId} AND v."createdAt" >= ${since}
        ORDER BY v."storeId", v."createdAt" DESC
      ), top AS (SELECT * FROM latest ORDER BY "createdAt" DESC LIMIT ${limit})
      SELECT
        (SELECT f->>'content' FROM jsonb_array_elements(v.snapshot->'files') f WHERE f->>'path' = ${VOICE_FILE} LIMIT 1) AS voice,
        (SELECT f->>'content' FROM jsonb_array_elements(v.snapshot->'files') f WHERE f->>'path' = ${FRAME_DRAW_FILE} LIMIT 1) AS draw,
        (SELECT f->>'content' FROM jsonb_array_elements(v.snapshot->'files') f WHERE f->>'path' = ${'index.html'} LIMIT 1) AS home
      FROM top JOIN "StoreSourceVersion" v ON v."storeId" = top."storeId" AND v.revision = top.revision
      ORDER BY top."createdAt" DESC
    `);
    return rows.flatMap(row => {
      const voice = row.voice ? readVoice([{ path: VOICE_FILE, content: row.voice }]) : undefined;
      const sentences = row.home ? visibleSentences(row.home).slice(0, 80) : [];
      const kind = parseFrameDraw(row.draw).kind;
      return voice || sentences.length ? [{ ...(kind ? { kind } : {}), ...(voice ? { voice } : {}), sentences }] : [];
    });
  }

  /** The style cards recent proposals SHOWED, built or not (2026-10-11 variety), never a slot whose card was not shown: the merchant's last `limit` proposals and the
   *  last `limit` of the same kind across stores (30 days), newest first. Only the draw, device and display font travel. */
  async recentStyleCards(merchantId: string, kind: string, now = new Date(), limit = 20): Promise<ShownStyleCard[]> {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const rows = await this.prisma.$queryRaw<Array<{ slots: unknown; fonts: unknown; mine: boolean }>>(Prisma.sql`
      WITH mine AS (
        SELECT g.id, g."createdAt" FROM "StoreSourceGeneration" g JOIN "Store" s ON s.id = g."storeId"
        WHERE s."merchantId" = ${merchantId} AND g.proposal IS NOT NULL AND g."createdAt" >= ${since}
        ORDER BY g."createdAt" DESC LIMIT ${limit}
      ), same AS (
        SELECT g.id, g."createdAt" FROM "StoreSourceGeneration" g
        WHERE g.proposal IS NOT NULL AND g."createdAt" >= ${since} AND g.proposal->'slots'->0->>'kind' = ${kind}
        ORDER BY g."createdAt" DESC LIMIT ${limit}
      ), ids AS (SELECT id, "createdAt" FROM mine UNION SELECT id, "createdAt" FROM same)
      SELECT s."merchantId" = ${merchantId} AS mine,
        (SELECT jsonb_agg(jsonb_build_object('kind', x->'kind', 'mode', x->'mode', 'slot', x->'slot', 'draw', x->'draw', 'device', x->'device'))
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(g.proposal->'slots') = 'array' THEN g.proposal->'slots' ELSE '[]'::jsonb END) x) AS slots,
        (SELECT jsonb_agg(jsonb_build_object('slot', c->'card'->'slot', 'display', c->'dna'->'type'->'display'))
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(g.proposal->'design'->'concepts') = 'array' THEN g.proposal->'design'->'concepts' ELSE '[]'::jsonb END) c) AS fonts
      FROM ids JOIN "StoreSourceGeneration" g ON g.id = ids.id JOIN "Store" s ON s.id = g."storeId"
      ORDER BY ids."createdAt" DESC
    `);
    return rows.flatMap(row => {
      const fonts = Array.isArray(row.fonts) ? row.fonts as Array<{ slot?: unknown; display?: unknown }> : [];
      const slots = Array.isArray(row.slots) ? row.slots as Array<{ kind?: unknown; mode?: unknown; slot?: unknown; draw?: unknown; device?: unknown }> : [];
      return slots.flatMap((slot): ShownStyleCard[] => {
        if (slot.mode !== 'calm' && slot.mode !== 'bold') return [];
        // A slot whose lane failed was drawn but never shown (its proposal kept one card): counting it would tilt the
        // rotation, e.g. a phantom bold 'ticket' checkout pushing every next bold card to 'brand'.
        if (!fonts.some(font => font.slot === slot.slot)) return [];
        const draw = parseFrameDraw(JSON.stringify(slot.draw ?? null));
        const display = fonts.find(font => font.slot === slot.slot)?.display;
        return [{ ...(typeof slot.kind === 'string' ? { kind: slot.kind } : {}), mode: slot.mode, draw, ...(row.mine === true ? { mine: true } : {}), ...(isSignatureDevice(slot.device) ? { device: slot.device } : {}), ...(typeof display === 'string' && display && (row.mine === true || FONT_IDS.has(display)) ? { display } : {}) }];
      });
    });
  }

  async current(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { slug: true, sourceProject: { select: { revision: true, updatedAt: true } } } });
    if (!store) throw new NotFoundException("Store not found");
    return { slug: store.slug, revision: store.sourceProject?.revision ?? 0, updatedAt: store.sourceProject?.updatedAt ?? null };
  }

  // Aggregate in PostgreSQL so typing an estimate never downloads bundled image data.
  async authoredSize(merchantId: string, storeId: string, revision: number) {
    const rows = await this.prisma.$queryRaw<Array<{ size: number }>>(Prisma.sql`
      SELECT COALESCE(SUM(length(f->>'content') + length(f->>'path') + 32), 0)::int AS size
      FROM "StoreSourceVersion" v JOIN "Store" s ON s.id = v."storeId",
      LATERAL jsonb_array_elements(v.snapshot->'files') f
      WHERE s.id = ${storeId} AND s."merchantId" = ${merchantId} AND v.revision = ${revision}
      AND (CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v.snapshot->'files') marker WHERE marker->>'path' = 'storefront-framework.json')
        THEN f->>'path' ~ '^components/.*[.]tsx$' OR f->>'path' = 'styles/globals.css'
        ELSE f->>'path' ~ '[.](html|css|js)$' AND f->>'path' NOT IN ('config.js', 'commerce.js') END)
    `);
    return rows[0]?.size ?? 0;
  }

  async state(merchantId: string, storeId: string, before?: number) {
    await this.ownedStore(merchantId, storeId);
    const [project, versions] = await this.prisma.$transaction([
      this.prisma.storeSourceProject.findUnique({ where: { storeId }, select: { revision: true, updatedAt: true } }),
      this.prisma.storeSourceVersion.findMany({
        where: { storeId, ...(before ? { revision: { lt: before } } : {}) },
        orderBy: { revision: "desc" }, take: 31, select: summarySelect,
      }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { publication: await publicationState(this.prisma, storeId), revision: project?.revision ?? 0, updatedAt: project?.updatedAt ?? null, versions: versions.slice(0, 30), nextBefore: versions.length > 30 ? versions[29].revision : null };
  }

  async version(merchantId: string, storeId: string, revision: number) {
    await this.ownedStore(merchantId, storeId);
    const version = await this.prisma.storeSourceVersion.findUnique({ where: { storeId_revision: { storeId, revision } }, select: { ...summarySelect, snapshot: true } });
    if (!version) throw new NotFoundException("Source project revision not found");
    return version;
  }

  async prepare(input: SaveSourceProjectDto) {
    // DNA motifs are inlined into kit slots, so every save re-sanitises them, the merchant's own edits included.
    input = { ...input, files: withSanitizedMotifs(input.files).files };
    // The standard pages still owned by the platform follow the home on every save, generations included.
    if (!isNextSource(input.files)) input = { ...input, files: withRefreshedStaticStandardPages(input.files, sourceSitePurpose(input.brief)) };
    // A showcase whose merchant asked for the header's account button gets the account pages it opens (2026-10-16).
    if (!isNextSource(input.files)) input = { ...input, files: withShowcaseAccountPages(input.files, sourceSitePurpose(input.brief)) };
    let snapshot = sourceProjectSnapshot({ ...input, files: applySourceLayoutBaseline(await withSourceFonts(input.files)) });
    if (isNextSource(snapshot.files)) {
      const compiled = await compileNextPreview(snapshot.files.filter(f => nextSourceFile(f.path)), sourceSitePurpose(snapshot.brief));
      const paths = new Set(compiled.map(f => f.path));
      // A compiled store kit file only exists while globals.css has its block.
      snapshot = sourceProjectSnapshot({ ...input, files: [...snapshot.files.filter(f => !paths.has(f.path) && !f.path.startsWith('_compiled/') && f.path !== SOURCE_KIT_CSS_PATH), ...compiled] });
    } else {
      // The store kit CSS is validated on every save, the merchant's own included; their other stylesheets stay theirs.
      snapshot = { ...snapshot, files: applySourceKitCss(snapshot.files, { next: false, authored: false }).files };
      validateLegacySources(snapshot.files);
    }
    const system = savedSourceVisualSystem(snapshot.files);
    if (system?.version === 3) snapshot = { ...snapshot, files: snapshot.files.map(file => file.path === SOURCE_VISUAL_SYSTEM_FILE ? { ...file, content: JSON.stringify(withSourceStyleTokens(system, snapshot.files), null, 2) + '\n' } : file) };
    // Draft inspection and final saves share the same commerce presentation.
    const runtime = await currentSourceRuntime(snapshot);
    return sourceProjectSnapshot({ ...input, files: withoutCommerceTemplates(runtime.files) });
  }

  /** True when every page component (`nextSourceFile`) of the save is byte-identical to the base revision's. */
  private async componentsUnchanged(merchantId: string, storeId: string, input: SaveSourceProjectDto): Promise<boolean> {
    if (!input.revision) return false;
    const base = await this.version(merchantId, storeId, input.revision).catch(() => null);
    const before = new Map(((base?.snapshot as { files?: Array<{ path: string; content: string }> } | undefined)?.files ?? []).filter(file => nextSourceFile(file.path)).map(file => [file.path, file.content]));
    const after = input.files.filter(file => nextSourceFile(file.path));
    return after.length === before.size && after.every(file => before.get(file.path) === file.content);
  }

  async save(merchantId: string, storeId: string, input: SaveSourceProjectDto, generation?: GenerationSave, fence?: (tx: Prisma.TransactionClient) => Promise<void>) {
    await this.ownedStore(merchantId, storeId);
    // sketch.json may only travel with a save that derives the components from it (a Boceto edit or a generation
    // that just assembled them) or that leaves them byte-identical (a photo upload, asset roles): then the sketch
    // still describes the page. Any other save edited the components directly, so a carried-over sketch would be
    // stale and a later Boceto save would silently revert those edits.
    if (!generation && input.label !== 'Boceto editado' && input.files.some(file => file.path === 'sketch.json') && !(await this.componentsUnchanged(merchantId, storeId, input))) {
      input = { ...input, files: input.files.filter(file => file.path !== 'sketch.json') };
    }
    const snapshot = generation?.prepared ? assertPreparedSource(input, generation.prepared) : await this.prepare(input);
    if (generation?.prepared && (generation.products?.length || generation.productOperations?.length)) throw new BadRequestException('Las operaciones de catálogo deben prepararse por separado.');
    return this.append(storeId, input.revision, input.label, snapshot, null, generation, undefined, fence);
  }

  /** Apply the exact normalized bytes that were reviewed, without recompiling. */
  async applyPrepared(merchantId: string, storeId: string, revision: number, snapshot: SourceProjectSnapshot, digest: string, fence: (tx: Prisma.TransactionClient) => Promise<void>) {
    await this.ownedStore(merchantId, storeId);
    const checked = sourceProjectSnapshot({ ...snapshot, revision, label: 'Mejora visual verificada' });
    if (sourceProjectDigest(checked) !== digest) throw new ConflictException('La propuesta ya no coincide con la revisión visual.');
    return this.append(storeId, revision, 'Mejora visual verificada', checked, null, undefined, undefined, fence);
  }

  async setContactForm(merchantId: string, storeId: string, revision: number, enabled: boolean) {
    await this.ownedStore(merchantId, storeId);
    if (!revision) {
      await this.prisma.$transaction(async tx => {
        await tx.storeSourceProject.upsert({ where: { storeId }, create: { storeId }, update: {} });
        const unchanged = await tx.storeSourceProject.updateMany({ where: { storeId, revision: 0 }, data: { updatedAt: new Date() } });
        if (!unchanged.count) throw new ConflictException('Actualiza el sitio antes de cambiar el formulario.');
        await tx.store.update({ where: { id: storeId }, data: { contactFormEnabled: enabled } });
      });
      return { revision: 0 };
    }
    const previous = await this.version(merchantId, storeId, revision);
    const snapshot = await currentSourceRuntime(previous.snapshot as unknown as SourceProjectSnapshot);
    const files = withoutCommerceTemplates(snapshot.files).map(file => {
      if (file.path === 'config.js') {
        const match = file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
        if (!match) throw new BadRequestException('No se pudo leer la configuración del formulario.');
        const config = JSON.parse(match[1]);
        return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, data: { ...config.data, contactFormEnabled: enabled } })};` };
      }
      if (!isNextSource(snapshot.files) && enabled && file.path === 'index.html' && !file.content.includes('data-pagosya-contact')) {
        const slot = '<section id="contacto" data-pagosya-contact></section>';
        const target = /<\/main>/i.test(file.content) ? /<\/main>/i : /<\/body>/i;
        return { ...file, content: target.test(file.content) ? file.content.replace(target, slot + '$&') : file.content + slot };
      }
      return file;
    });
    return this.append(storeId, revision, enabled ? 'Formulario de contacto activado' : 'Formulario de contacto desactivado', { ...snapshot, files }, null, undefined, enabled);
  }

  async setMotion(merchantId: string, storeId: string, revision: number, motion: SourceMotionMode, scrollFeel?: SourceScrollFeel) {
    const previous = await this.version(merchantId, storeId, revision);
    const snapshot = previous.snapshot as unknown as SourceProjectSnapshot;
    const files = await withSourceMotionSettings(snapshot.files, { motion, scrollFeel });
    const label = { auto: 'Movimiento según el diseño', off: 'Sin movimiento', subtle: 'Movimiento sutil', expressive: 'Movimiento expresivo' }[motion];
    return this.save(merchantId, storeId, { revision, label, brief: snapshot.brief, files });
  }

  async editFile(merchantId: string, storeId: string, input: EditSourceFileDto) {
    return this.editFiles(merchantId, storeId, { revision: input.revision, files: [{ path: input.path, content: input.content }] });
  }

  /** Adds the standard information pages (and the footer link to them) to a store built before they existed. The new revision
   * is not published: the merchant reviews it like any other change. */
  async addStandardPages(merchantId: string, storeId: string, revision: number) {
    await this.ownedStore(merchantId, storeId);
    if (!revision) throw new BadRequestException('Crea el sitio antes de agregar páginas.');
    const previous = await this.version(merchantId, storeId, revision);
    // The stored snapshot as it is, like editFiles: the platform swaps in the current runtime whenever a page renders, and
    // the refreshed (composed) commerce.js is over the size a saved file may have.
    const snapshot = previous.snapshot as unknown as SourceProjectSnapshot;
    // Until 2026-10-06 this refused anything but a React store, so a merchant who kept an authored (Sep-5)
    // store had no cookies, privacy or terms page and no account navigation. The runtime that fills those
    // pages is plain JS and never cared which pipeline wrote the store; only the scaffolding was missing.
    const result = isNextSource(snapshot.files) ? withStandardPages(snapshot.files) : withStaticStandardPages(snapshot.files, sourceSitePurpose(snapshot.brief));
    if (!result.added.length && !(result as { refreshed?: string[] }).refreshed?.length && !result.slotAdded) throw new ConflictException('Este sitio ya tiene las páginas estándar, o su diseño no permite agregarlas.');
    return this.save(merchantId, storeId, { revision, label: 'Páginas estándar agregadas', brief: snapshot.brief, files: result.files });
  }

  /** Several text files as one revision (the code editor sends one; the MCP server sends a batch). */
  async editFiles(merchantId: string, storeId: string, input: { revision: number; files: Array<{ path: string; content: string }> }) {
    if (!input.files.length || input.files.length > 20) throw new BadRequestException('Edita entre 1 y 20 archivos a la vez.');
    const version = await this.version(merchantId, storeId, input.revision);
    const snapshot = version.snapshot as unknown as SourceProjectSnapshot;
    const edits = new Map<string, string>();
    for (const edit of input.files) {
      if (isNextSource(snapshot.files) && !nextSourceFile(edit.path)) throw new BadRequestException('Edita los componentes React o styles/globals.css; los archivos compilados se actualizan automáticamente.');
      const file = snapshot.files.find((entry) => entry.path === edit.path);
      if (!file || file.encoding === "base64") throw new BadRequestException("Selecciona un archivo de texto existente.");
      edits.set(edit.path, edit.content);
    }
    const label = edits.size === 1 ? `Edición de ${[...edits.keys()][0]}` : `Edición de ${edits.size} archivos`;
    return this.save(merchantId, storeId, { revision: input.revision, label: label.slice(0, 120), brief: snapshot.brief,
      files: snapshot.files.map((entry) => edits.has(entry.path) ? { ...entry, content: edits.get(entry.path)! } : entry) });
  }

  async visualFields(merchantId: string, storeId: string, revision: number) {
    const current = await this.current(merchantId, storeId);
    if (current.revision !== revision) throw new ConflictException('El proyecto cambió. Recarga la revisión antes de editar.');
    if (!revision) return { revision, fields: [] };
    const saved = await this.version(merchantId, storeId, revision);
    return { revision, fields: sourceVisualFields((saved.snapshot as unknown as SourceProjectSnapshot).files) };
  }

  async visualEdit(merchantId: string, storeId: string, input: SourceVisualEditDto) {
    const current = await this.current(merchantId, storeId);
    if (current.revision !== input.revision) throw new ConflictException('El proyecto cambió. Recarga la revisión antes de editar.');
    const saved = await this.version(merchantId, storeId, input.revision);
    const snapshot = saved.snapshot as unknown as SourceProjectSnapshot;
    const edit = applySourceVisualEdit(snapshot.files, input.fieldId, input.value);
    return this.save(merchantId, storeId, { revision: input.revision, label: edit.label, brief: snapshot.brief, files: edit.files });
  }

  private async append(storeId: string, revision: number, label: string, snapshot: SourceProjectSnapshot, restoredFrom: number | null = null, generation?: GenerationSave, contactFormEnabled?: boolean, fence?: (tx: Prisma.TransactionClient) => Promise<void>) {
    if (!Number.isInteger(revision) || revision < 0 || revision >= 2_147_483_647) throw new BadRequestException("Invalid project revision");
    if (typeof label !== "string" || !label.trim() || label.trim().length > 120) throw new BadRequestException("Invalid revision label");
    const deletedImageUrls: string[] = [];
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await fence?.(tx);
        await sourceRequestContext.getStore()?.assertLease(tx, revision + 1, storeId);
        await tx.storeSourceProject.upsert({ where: { storeId }, create: { storeId }, update: {} });
        const updated = await tx.storeSourceProject.updateMany({ where: { storeId, revision }, data: { revision: { increment: 1 } } });
        if (updated.count !== 1) throw new ConflictException("El proyecto cambió en otra sesión. Recarga la revisión antes de guardar.");
        if (contactFormEnabled !== undefined) await tx.store.update({ where: { id: storeId }, data: { contactFormEnabled } });
        const createdProducts: PaymentLink[] = [];
        const optionChanges: Array<{ productName: string; count: number }> = [];
        for (const product of generation?.products || []) {
          const variants = normalizeProductVariants(product.variants);
          if (variants.length) optionChanges.push({ productName: product.name, count: variants.length });
          createdProducts.push(await tx.paymentLink.create({ data: { storeId, name: product.name, description: product.description,
            ...(product.subscriptionOptions?.length ? { subscriptionOptions: { create: validateProductSubscriptions({ options: product.subscriptionOptions }) } } : {}),
            amount: variants.length ? Math.min(...variants.map(variant=>variant.amount)) : product.amount,
            ...(variants.length ? { variants: variants as unknown as Prisma.InputJsonValue, stock: totalVariantStock(variants) } : {}),
            currency: product.currency || 'BOB', imageUrls: [...new Set([...(product.imageUrls || []),...variants.flatMap(variant=>variant.imageUrl ? [variant.imageUrl] : [])])] } }));
        }
        const updatedProducts: Array<{ id: string; name: string }> = [];
        const deletedProducts: Array<{ id: string; name: string }> = [];
        for (const operation of generation?.productOperations || []) {
          if (operation.variantOperations?.length) {
            // Serialize against stock decrements while reading and applying a small option delta.
            await tx.$queryRaw`SELECT id FROM "PaymentLink" WHERE id = ${operation.productId} AND "storeId" = ${storeId} FOR UPDATE`;
          }
          const existing = await tx.paymentLink.findFirst({ where: { id: operation.productId, storeId } });
          if (!existing) throw new NotFoundException('El producto seleccionado ya no existe en esta tienda.');
          if (operation.action === 'delete') {
            if (existing.fulfillmentType === 'DIGITAL') throw new BadRequestException('Archiva el producto digital para conservar los archivos de pedidos pagados.');
            deletedImageUrls.push(...existing.imageUrls);
            await tx.paymentLink.delete({ where: { id: existing.id } });
            deletedProducts.push({ id: existing.id, name: existing.name });
            continue;
          }
          const changes = operation.changes || {};
          if (operation.subscriptionOperations?.length) {
            await applyProductSubscriptionOperations(tx, storeId, existing.id, operation.subscriptionOperations);
          }
          const variants = operation.variantOperations?.length
            ? applyVariantOperations((Array.isArray(existing.variants) ? existing.variants : []) as unknown as ProductVariant[], operation.variantOperations) : undefined;
          if (variants) optionChanges.push({ productName: changes.name || existing.name, count: variants.length });
          if (Array.isArray(existing.variants) && existing.variants.length && changes.currency !== undefined && changes.currency !== existing.currency) throw new BadRequestException('Cambia la moneda y los precios de todas las combinaciones juntos desde Productos.');
          if (!variants && Array.isArray(existing.variants) && existing.variants.length && (changes.amount !== undefined || changes.stock !== undefined)) {
            throw new BadRequestException('Este producto tiene combinaciones. Indica qué opciones deben cambiar de precio o stock.');
          }
          const updated = await tx.paymentLink.update({ where: { id: existing.id }, data: {
            ...(changes.name !== undefined && { name: changes.name }),
            ...(changes.description !== undefined && { description: changes.description }),
            ...(changes.imageUrls !== undefined && { imageUrls: changes.imageUrls }),
            ...(changes.imagePositions !== undefined && { imagePositions: changes.imagePositions }),
            ...(changes.tags !== undefined && { tags: changes.tags }),
            ...(changes.stock !== undefined && { stock: changes.stock }),
            ...(changes.color !== undefined && { color: changes.color }),
            ...(changes.amount !== undefined && { amount: changes.amount }),
            ...(changes.currency !== undefined && { currency: changes.currency }),
            ...(variants ? { variants: variants as unknown as Prisma.InputJsonValue,
              amount: Math.min(...variants.map(variant=>variant.amount)),
              ...(variants.every(variant=>variant.stock !== undefined) ? { stock: totalVariantStock(variants) } : {}),
              imageUrls: [...new Set([...(changes.imageUrls ?? existing.imageUrls),...variants.flatMap(variant=>variant.imageUrl ? [variant.imageUrl] : [])])],
            } : {}),
          } });
          updatedProducts.push({ id: updated.id, name: updated.name });
        }
        if (createdProducts.length || updatedProducts.length || deletedProducts.length) {
          const catalog = await tx.paymentLink.findMany({ where: { storeId, status: PaymentLinkStatus.ACTIVE }, orderBy: { createdAt: 'desc' } });
          snapshot = { ...snapshot, files: snapshot.files.map(file => {
            if (file.path !== 'config.js') return file;
            const match = file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
            if (!match) throw new BadRequestException('No se pudo actualizar el catálogo.');
            const config = JSON.parse(match[1]);
            const items = catalog.map(p => ({ id: p.id, name: p.name, description: p.description, amount: p.amount, currency: p.currency, stock: p.stock, imageUrls: p.imageUrls, imagePositions: p.imagePositions, variants: p.variants, extras: p.extras, tags: p.tags, color: p.color, categoryId: p.categoryId, recommendedProductIds: p.recommendedProductIds }));
            return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, data: { ...config.data, items } })};` };
          }) };
          snapshot = sourceProjectSnapshot({ ...snapshot, revision, label });
        }
        if (generation?.enablePayments) await tx.store.update({ where: { id: storeId }, data: { checkoutMode: "payment" } });
        if (generation) {
          const completed = await tx.storeSourceGeneration.updateMany({ where: { id: generation.id, storeId, status: 'RUNNING', activeStoreId: storeId }, data: generation.data });
          if (completed.count !== 1) throw new ConflictException('La generación expiró. Tu revisión anterior sigue guardada.');
        }
        const saved = await tx.storeSourceVersion.create({ data: {
          storeId, revision: revision + 1, label: label.trim(), digest: sourceProjectDigest(snapshot),
          snapshot: snapshot as unknown as Prisma.InputJsonValue, restoredFrom, designFingerprint: snapshotDesignFingerprint(snapshot.files),
        }, select: summarySelect });
        return { ...saved, createdProducts: createdProducts.map(p => ({ id: p.id, name: p.name })), updatedProducts, deletedProducts, ...(optionChanges.length ? { optionChanges } : {}) };
      }, fence ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } : undefined);
      if (deletedImageUrls.length) await this.uploads?.deleteFiles(deletedImageUrls);
      return result;
    } catch (error) {
      if (fence && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new DesignRetryableConflict("La transacción se reintentará con la misma revisión.");
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
        throw new ConflictException("El proyecto cambió en otra sesión. Recarga la revisión antes de guardar.");
      }
      throw error;
    }
  }

  async restore(merchantId: string, storeId: string, targetRevision: number, currentRevision: number) {
    const version = await this.version(merchantId, storeId, targetRevision);
    const stored = version.snapshot as unknown as SourceProjectSnapshot;
    // Revalidate old snapshots before creating a new revision under today's contract.
    const snapshot = sourceProjectSnapshot({ ...stored, revision: currentRevision, label: `Restaurada desde revisión ${targetRevision}` });
    if (sourceProjectDigest(snapshot) !== version.digest) throw new ConflictException("Source project integrity check failed");
    return this.append(storeId, currentRevision, `Restaurada desde revisión ${targetRevision}`, snapshot, targetRevision);
  }

  async archive(merchantId: string, storeId: string, revision: number) {
    const version = await this.version(merchantId, storeId, revision);
    const stored = version.snapshot as unknown as SourceProjectSnapshot;
    const snapshot = sourceProjectSnapshot({ ...stored, revision, label: version.label });
    if (sourceProjectDigest(snapshot) !== version.digest) throw new ConflictException("Source project integrity check failed");
    const runtime = await currentSourceRuntime(snapshot);
    for (const name of ['build.mjs', 'server.mjs']) { const file = runtime.files.find(f => f.path === name); if (file) file.content = await readFile(kitPath(name), 'utf8'); }
    return { filename: `storefront-r${revision}-${version.digest.slice(0, 12)}.zip`, buffer: sourceProjectArchive(isNextSource(runtime.files) ? { ...runtime, files: nextProjectExport(runtime.files, (await this.ownedStore(merchantId, storeId)).slug).map(f => ({ ...f, encoding: f.encoding || 'utf8' })) } : runtime, revision, version.restoredFrom) };
  }
}
