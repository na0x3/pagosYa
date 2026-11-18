import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium } from 'playwright';
import { PrismaService } from '../../prisma/prisma.service';
import { AiUsageService } from '../../ai-usage/ai-usage.service';
import { SourceProjectsService } from '../source-projects.service';
import { isClaude, sourceProvider } from '../source-provider';
import { claudeJson, type V2Part as ClaudePart } from './v2-claude';
import { checkSourceProviderQuota, SourceProviderQuotaException } from '../source-provider-error';
import { MODEL_LIMIT, MODEL_LIMIT_MERCHANT_FAILURE } from '../source-validation-error';
import { sourceResponseJson } from '../source-response';
import { sourceUsage } from '../source-generation-policy';
import { assertSourceCommerceContract } from '../source-commerce-contract';
import { preparedSourceArtifact } from '../source-prepared-artifact';
import { probeSourceShopping, withVisualSandbox } from '../source-visual-capture';
import { sourceVisualState } from '../source-visual-state';
import { isNextSource, nextProjectScaffold } from '../source-next';
import { resolveAccountTheme, snapshotWithAccountTheme } from '../account-theme';
import { templateQaFindings } from '../source-template-qa';
import type { SourceProjectSnapshot } from '../source-project';
import { assembleV2Files, photoDataUrl, readConfigData, v2Context, type V2Context, type V2Cutout, withStoreSettings } from './v2-context';
import { creativeText, V2_CONCEPT_PROMPT, v2ConceptSchema } from './v2-prompts';
import { ANIMATED_RULES, composeV2Home, readV2Half, v2HalfInput, v2HalfSchema, type V2Half } from './v2-prompts';
import { joinV2Parts, mergeV2Fix, readV2Part, v2Hint, v2Repairs, v2FixInput, v2FixPrompt, v2FixSchema, v2DirectionInput, v2DirectionPrompt, v2DirectionSchema, v2WriterInput, v2WriterPrompt, v2WriterSchema, type V2Direction, type V2Part } from './v2-prompts';
import type { V2File } from './v2-context';
import { v2CartSheet } from './v2-kit-baseline';
import { mergeSectionFix, sectionFixPlan, v2SectionFixInput, v2SectionFixPrompt, v2SectionFixSchema } from './v2-section-fix';
import { publicRetentionSettings } from '../../retention/retention.service';
import { DEFAULT_RETENTION } from '../../retention/retention.dto';
import { wordsLookPrompt, wordsLookSchema } from './v2-words';
import { allowedHeroIdeas, drawsLibre, heroIdea, newestStores, readShowcases, readStoreLooks } from './v2-heroes';
import { allowedMenus, cleanMenu } from './v2-menus';
import { BASIC_BLOCKERS, freeBlocking, inspectionRules, runV2Build, withContextMenu, type V2Attempt, type V2BuildDeps } from './v2-run';
import { captureV2Look, v2LookInput, v2LookLines, v2LookPrompt, v2LookSchema, type V2LookCapture, type V2LookProblem } from './v2-look';
import { apiRoot, buildInSandbox } from './v2-sandbox';
import { SourceChatService } from '../source-chat.service';
import { UploadsService } from '../../uploads/uploads.service';
import { measureHugePhotos, stickyOverlapLines, withPhotoCaps } from './v2-settle';
import { readV2LibraryFile, withoutRepeatedPhotos, buildV2Library, mergeV2LibraryEntries, V2_LIBRARY_FILE, v2LibraryFacts, v2LibraryFactsText, v2LibraryFile, type V2LibraryEntry } from './v2-library';
import { cardText, pickReferences, V2_REFERENCES, v2CardPrompt, v2CardSchema, type V2Card, type V2Reference } from './v2-references';
import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { productCutout } from '../source-photo-cutout';
import { uploadPath } from '../source-product-photos';
import { matchSector, photoLibraryDir, planLibraryTopUp, readPhotoLibrary } from './v2-photo-library';
import { layoutSignature, signatureDistance, type SectionShape } from './v2-signature';

/** V2 prototype (docs/superpowers/specs/2026-11-14-v2-prototype-design.md): an AI-written home + product page for one store, built in
 *  the sandbox and saved as a draft revision «Diseño V2 (prototipo)». Dev only (YAPI_V2_PROTO=1); section fill and the chat never
 *  call it, and nothing is published or migrated. */

export const V2_LABEL = 'Diseño V2 (prototipo)';
/** The remix extras call (owner 2026-11-18): the site's login look and its not-found page. */
const REMIX_EXTRAS_PROMPT = `Copias dos páginas de un sitio a una tienda pagosYa, mirando sus capturas.
1) INGRESO: el formulario lo dibuja la plataforma; tú eliges su forma. layout: «split» (foto a un lado, formulario al otro), «card», «minimal» o «panel», el más parecido a la captura. photo: con split, la ruta de UNA foto de la tienda (de la lista) que se parezca a la de la captura; si no, vacío. css: reglas para las partes, con selectores [data-part="card"], [data-part="title"], [data-part="input"], [data-part="submit"], [data-part="link"] (y media, lead, field, label): color, fondo, borde, radio, sombra, tipografía, mayúsculas, espaciado, como en la captura. Usa var(--ui-...) o colores hex de la paleta. Nunca ocultes, achiques ni tapes campos, botones o enlaces.
2) PÁGINA 404: notFound es un componente React (TSX) completo. Primera línea: import Shell from '../Shell'; luego export default function NotFound() { return <Shell>…</Shell>; }. Dentro, un <main id="contenido"> con la composición de su 404 (fondo, ilustración o foto de la tienda con <img src="assets/…" alt="…">, un texto corto en español con su tono, y un botón <a href="index.html">). Sin imports más que Shell, sin estado, sin scripts. notFoundCss: el CSS de esa página con clases propias que empiecen por nf-.`;
const REMIX_EXTRAS_SCHEMA = { type: 'object', additionalProperties: false, required: ['layout', 'photo', 'css', 'notFound', 'notFoundCss'], properties: {
  layout: { type: 'string', enum: ['split', 'card', 'minimal', 'panel'] }, photo: { type: 'string' }, css: { type: 'string' }, notFound: { type: 'string' }, notFoundCss: { type: 'string' } } };
/** Copy a store (2026-11-17, Graza): an imported store starts as plain pages, without the React build. V2 writes components, so
 *  the store gets the build's runtime and its marker first (home and product, the pages V2 writes, and the platform's checkout); otherwise the design was
 *  saved but never built, and the checks looked at the old plain page. */
export function withV2Scaffold<T extends { path: string; content: string }>(files: T[]): T[] {
  if (isNextSource(files as never)) return files;
  const known = new Set(files.map(file => file.path));
  const routes = [{ name: 'home', path: 'index.html' }, { name: 'product', path: 'product.html' }, { name: 'checkout', path: 'checkout.html' }] as const;
  const runtime = nextProjectScaffold('store', routes).filter(file => ['lib/creative.tsx', 'lib/ui.tsx', 'creative.d.ts', 'storefront-framework.json'].includes(file.path) && !known.has(file.path));
  // A shop build needs a checkout page (live 2026-11-18: «Falta components/checkout.tsx»): the platform's checkout inside V2's Shell.
  const checkout = known.has('components/checkout.tsx') ? [] : [{ path: 'components/checkout.tsx', content: "import Shell from './Shell';\n\nexport default function Checkout() {\n  return <Shell>\n    <main id=\"contenido\" className=\"es-page\" data-pagosya-checkout-page />\n    <p data-pagosya-status role=\"status\" aria-live=\"polite\" />\n  </Shell>;\n}\n" }];
  return [...files, ...runtime as unknown as T[], ...checkout as unknown as T[]];
}
/** The study library on disk: <host>/ pictures + facts.json, index.json, cards/<host>.json (scripts/brand-bench/v2-references.cjs). */
/** The store photos the written home shows itself (the library's blocks take the others first). */
const ownPhotos = (files: readonly V2File[]) => [...new Set(files.filter(file => file.path === 'components/home.tsx').flatMap(file => [...file.content.matchAll(/assets\/[\w.-]+\.(?:jpe?g|png|webp)/g)].map(match => match[0])))];
const referencesDir = () => join(apiRoot(), '..', '..', 'examples', 'v2-proto', 'references');
/** What the cut-out look asks (vetCutouts). */
const CUTOUT_LOOK_PROMPT = 'Revisas recortes automáticos de fotos de una tienda: un modelo quitó el fondo y cada recorte se mostrará solo, flotando sobre un color liso, en una vitrina grande. Un recorte sirve solo si muestra UN producto entero (o unos pocos del mismo producto ordenados, o una persona entera vistiendo la prenda) con el borde limpio. Es malo si: está cortado (piernas sin cuerpo, media prenda, media lata), entra una mano o un brazo suelto, quedó un marco o forma de la foto (ojo de cerradura, tarjeta, rectángulo, cartel, collage de fotos), hay un logo, monograma o letras sueltas encima o alrededor que no están impresos en el producto, quedan restos del fondo (mesa, pared, piso, estante, sombra grande), partes transparentes o borrosas, o es una pila desordenada. Lo impreso en el envase, la caja o la etiqueta está bien. El fondo gris es solo para que lo veas. Para CADA recorte devuelve n (su número), ok (true si sirve), what (qué muestra, en 2 a 6 palabras: el producto y, si se lee en la etiqueta o se ve, su sabor, color o variante — «lata Lemon · Ginger», «vestido halter marfil», «vaso de mango en caja») y why (si no sirve, por qué en una frase corta; si sirve, vacío).';
/** Each photo's cut-out (or why it gave none) and YAPI's verdict on each cut-out, kept between runs (productCutouts). */
const cutoutsDir = () => join(apiRoot(), '..', '..', 'examples', 'v2-proto', 'cutouts');
/** A picture's fingerprint: 8×8 brighter-than-the-right-neighbour bits (a «difference hash»); the same photo saved again, resized or
 *  recompressed, lands within a few bits. */
async function pictureHash(bytes: Buffer): Promise<bigint> {
  const pixels = await sharp(bytes).rotate().greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let hash = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) hash = (hash << 1n) | (pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? 1n : 0n);
  return hash;
}
const samePicture = (a: bigint, b: bigint) => { let diff = a ^ b, bits = 0; while (diff) { bits += Number(diff & 1n); diff >>= 1n; } return bits <= 6; };
/** What YAPI saw when it looked at its own pages (owner 2026-11-15), one folder per look. */
const looksDir = () => join(apiRoot(), '..', '..', 'examples', 'v2-proto', 'looks');
/** The library sections a design places and the store facts they are filled from; a fix may swap or add entries. */
type V2Lib = { entries: V2LibraryEntry[]; facts: ReturnType<typeof v2LibraryFacts> };
type Stage = { stage: string; ms: number; detail?: unknown };
export type V2RunState = {
  status: 'RUNNING' | 'DONE' | 'FAILED'; startedAt: string; baseRevision?: number; revision?: number; error?: string; model?: string; maxUsd?: number;
  /** Owner 2026-11-16 («do that»): one run in library-first mode (false) or free mode (true) whatever YAPI_V2_FREE says. */
  free?: boolean;
  /** Owner 2026-11-16 («let users give a link and our ai remixes the users website to be like the link»): the site this run remixes. */
  remix?: string;
  /** Copy a store (owner 2026-11-17, Graza): the remixed site is the merchant's OWN old shop, so its logo, phrases and artwork are theirs to keep. */
  ownSite?: boolean;
  /** What a remix copied beyond the home (owner 2026-11-18): the login look and whether a not-found page was written. */
  extras?: { login: string | null; notFound: boolean };
  /** Owner 2026-11-16 («drop restrictions for now»): loose mode for this run. */
  loose?: boolean;
  /** Owner 2026-11-16: the Nov 14 rule set (Gramiyaa r3) for this run. */
  basic?: boolean;
  /** Owner 2026-11-17: the creative setting for this run, and the concept it chose. */
  creative?: boolean; concept?: { name: string; idea: string; why: string };
  stages: Stage[]; direction?: V2Direction; attempts?: V2Attempt[]; usd: number;
  /** Spec 2026-11-16 store quality, Part 4: the rules behind each checked attempt («desktop:rule», «phone:rule»). */
  inspections?: Array<{ at: string; rules: string[] }>;
  looks?: Array<{ attempt: number; ms: number; shots: number; dir: string; problems: string[] }>; references?: string[]; cards?: number; ownCards?: boolean; library?: { slots: string[]; dropped: Record<string, string> };
  checks?: { rules: Array<{ width: number; blocking: string[] }>; shopping: unknown; signature: SectionShape[]; templateSignature: SectionShape[]; distanceFromTemplate: number };
};
type V2StudyState = { status: 'RUNNING' | 'DONE'; startedAt: string; done: string[]; skipped: string[]; failed: Array<{ host: string; reason: string }>; usd: number };
type Content = { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'high' | 'low' };
/** A spent plan quota or model limit stops the run (the same test the chat uses); anything else is one failed attempt. */
// Live 2026-11-14 03:44: the ChatGPT bridge answers a used-up plan with «subscription_sharing_usage_limit_exceeded», which the
// shared quota check did not know — BOXY spent three instant attempts on it.
/** Owner 2026-11-16 («remix the users website to be like the link»): what the art direction and the writers hear in a remix. */
const remixDirectionText = (host: string) => `REMIX DE ${host}: el comerciante quiere que SU tienda se sienta como este sitio. Sigue estas capturas sección por sección: el mismo orden de secciones, la misma forma de cabecera y de menú, el mismo tipo de portada, la misma paleta (o la más cercana) y el mismo carácter de letra, el mismo aire y ritmo, el mismo estilo de tarjetas y de fotos. Con los productos, fotos, datos y voz de ESTA tienda: nunca su logo, su nombre, sus textos ni sus fotos.`;
const remixLooseText = (host: string) => `REMIX DE ${host} (capturas abajo): copia este sitio lo más fiel que puedas — la misma portada, las mismas secciones en el mismo orden, la misma cabecera, la misma paleta, la misma letra (o la más parecida que tengas), los mismos tamaños, espacios y estilo de fotos y tarjetas —, con los productos, fotos, datos y textos de ESTA tienda. Nunca su logo, su nombre, sus textos ni sus fotos.`;
/** The merchant's own old shop (copy a store): its identity is theirs, so the copy keeps it. */
const OWN_SITE_TEXT = ' ESTE SITIO ES LA TIENDA ANTERIOR DEL PROPIO COMERCIANTE (la está trayendo a pagosYa): su logo, su nombre, sus frases y su arte SON suyos. Usa su logo dibujado, sus ilustraciones, sellos y fotos de marca (están entre las fotos de la tienda) y sus frases tal cual; recrea su portada, su cabecera y su carácter lo más fiel que puedas. En la portada muestra pocos productos destacados (4 a 8), no el catálogo entero.';
const ownRemix = (text: string, own?: boolean) => own ? text.replace(/(?:: |\. )?[Nn]unca su logo, su nombre, sus textos ni sus fotos\.|; el contenido es siempre el de esta tienda, nunca el de ese sitio\./, '.') + OWN_SITE_TEXT : text;
const remixWriterText = (host: string) => `REMIX DE ${host} (capturas abajo): la tienda se siente como ese sitio — orden de secciones, cabecera, paleta, letra, ritmo, tarjetas —; el contenido es siempre el de esta tienda, nunca el de ese sitio.`;
const spent = (error: unknown) => error instanceof SourceProviderQuotaException || (error instanceof Error && (error.message.includes(MODEL_LIMIT_MERCHANT_FAILURE)
  // Live 2026-11-14 13:07 (round 4): a 429 from the bridge reads «ChatGPT indicó un límite de uso» — the writer took it for an empty
  // answer and spent three more instant attempts.
  || MODEL_LIMIT.test(error.message) || /usage_limit|limit_exceeded|insufficient_quota|límite de uso/i.test(error.message)));

@Injectable()
export class SourceV2PrototypeService {
  private readonly log = new Logger('ProductSource');
  private readonly runs = new Map<string, V2RunState>();

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly projects: SourceProjectsService, private readonly chat: SourceChatService, @Optional() private readonly metering?: AiUsageService, @Optional() private readonly uploads?: UploadsService) {}

  private enabled() { if (this.config.get<boolean>('app.yapiV2Proto') !== true) throw new NotFoundException(); }

  async status(merchantId: string, storeId: string) {
    this.enabled();
    await this.projects.version(merchantId, storeId, await this.latest(storeId));
    return this.runs.get(storeId) ?? null;
  }

  async start(merchantId: string, storeId: string, input: { revision?: number; references?: string[]; restyleCards?: boolean; animated?: boolean; model?: string; maxUsd?: number; free?: boolean; remix?: string; ownSite?: boolean; loose?: boolean; rules?: string; creative?: boolean }) {
    this.enabled();
    if (this.runs.get(storeId)?.status === 'RUNNING') throw new ConflictException('Ya hay un diseño V2 en curso para esta tienda.');
    // The design starts from the store's last template revision, not from an earlier V2 design: its data and the library's code
    // live there (spec 2026-11-14 v2-library-sections).
    const revision = input.revision ?? await this.templateBase(storeId);
    await this.projects.version(merchantId, storeId, revision);
    const remix = input.remix && /^https:\/\//.test(input.remix) ? input.remix : undefined;
    const references = remix ? [remix] : (input.references ?? []).filter(url => /^https:\/\//.test(url)).slice(0, 2);
    const state: V2RunState = { status: 'RUNNING', startedAt: new Date().toISOString(), baseRevision: revision, stages: [], usd: 0,
      // Owner 2026-11-16: one run on a model of its own (a Claude model, paid from the Anthropic key), with a spending cap.
      ...(input.model ? { model: input.model } : {}), ...(input.maxUsd ? { maxUsd: input.maxUsd } : {}), ...(typeof input.free === 'boolean' ? { free: input.free } : {}), ...(remix ? { remix, ...(input.ownSite ? { ownSite: true } : {}) } : {}), ...(input.loose ? { loose: true } : {}), ...(input.creative ? { creative: true } : {}), // Owner 2026-11-16: the Nov 14 rules are the default (YAPI_V2_RULES=nov14) unless a run asks for «strict» or loose mode.
      ...(input.rules === 'nov14' || (!input.rules && !input.loose && process.env.YAPI_V2_RULES === 'nov14') ? { basic: true } : {}) };
    this.runs.set(storeId, state);
    void this.run(merchantId, storeId, revision, references, state, input.restyleCards === true, input.animated === true).catch(error => {
      state.status = 'FAILED'; state.error = String((error as Error)?.message ?? error).slice(0, 1000);
      this.log.warn(JSON.stringify({ event: 'v2_prototype_failed', storeId, error: state.error }));
    });
    return state;
  }

  /** Spec 2026-11-17 (V2 in the chat): a new store's first design, run inside its chat job and awaited. The model is YAPI_V2_CHAT_MODEL
   *  (default Claude Opus 5.5), capped by YAPI_V2_CHAT_MAX_USD (default $10), with the default rules (YAPI_V2_RULES). YAPI says how it
   *  went in the chat; a failure leaves the template revision and says so. */
  async designForChat(merchantId: string, storeId: string, revision: number): Promise<{ revision: { revision: number } } | { assistantMessage: { metadata: { failed: true } } }> {
    if (this.runs.get(storeId)?.status === 'RUNNING') throw new ConflictException('Ya hay un diseño en curso para esta tienda.');
    const state: V2RunState = { status: 'RUNNING', startedAt: new Date().toISOString(), baseRevision: revision, stages: [], usd: 0,
      model: process.env.YAPI_V2_CHAT_MODEL || 'claude-opus-5-5', maxUsd: Number(process.env.YAPI_V2_CHAT_MAX_USD) > 0 ? Number(process.env.YAPI_V2_CHAT_MAX_USD) : 10,
      ...(process.env.YAPI_V2_RULES === 'nov14' ? { basic: true } : {}),
      // Owner 2026-11-17 («why same sections are always used» … «lets do that»): the chat's first designs in the creative setting.
      ...(process.env.YAPI_V2_CHAT_CREATIVE === '1' ? { creative: true } : {}) };
    this.runs.set(storeId, state);
    try {
      await this.run(merchantId, storeId, revision, [], state);
      await this.postChat(storeId, 'Listo: diseñé tu tienda con tus productos y tus fotos. Mírala en la vista previa y dime qué quieres cambiar.', { sourceRevision: state.revision, v2: { revision: state.revision, usd: state.usd } });
      return { revision: { revision: state.revision! } };
    } catch (error) {
      state.status = 'FAILED'; state.error = String((error as Error)?.message ?? error).slice(0, 1000);
      this.log.warn(JSON.stringify({ event: 'v2_chat_failed', storeId, error: state.error }));
      await this.postChat(storeId, 'No pude terminar el diseño: tu tienda quedó con su plantilla. Escribe «sigue» o pídemelo de nuevo para reintentar.', { failed: true, v2: { error: state.error.slice(0, 300) },
        // «sigue» runs this design again from the same template revision (source-chat-jobs resume).
        pendingRequest: { instruction: 'Primer diseño de la tienda con el motor V2.', direct: true, v2DesignFrom: revision } }).catch(() => undefined);
      return { assistantMessage: { metadata: { failed: true } } };
    }
  }

  /** Re-assembles the store's latest V2 design with the platform's current parts — no model call (owner 2026-11-14 «half of the
   *  limit for 2 stores» + «visual errors»: the faults were in the platform's own CSS, card and header rules, not in the design).
   *  The written files are kept as saved (Shell, home, product, the library slots, the design's CSS without the platform blocks);
   *  the platform blocks, the library code and styles are taken fresh; built in the sandbox and saved as a new revision. */
  async reassemble(merchantId: string, storeId: string, cart?: { look?: string; photo?: string }, css?: string) {
    this.enabled();
    const { head, from, written, base, baseRevision, files, context } = await this.latestDesign(merchantId, storeId);
    // A design saved before the cart looks (2026-11-14) gets the one asked for here.
    if (cart?.look) context.cartSheet = v2CartSheet(cart.look, context.storeName, cart.photo);
    // The current repairs too (live 2026-11-15: DooBoo's product page and contact mounts were fixable without a model call).
    const repaired = v2Repairs(written, context);
    // A CSS patch for a fault code can settle without a model call (owner 2026-11-16, NOA r14 product page).
    if (css?.trim()) repaired.files = repaired.files.map(file => file.path === 'styles/globals.css' ? { ...file, content: `${file.content}\n/* v2:patch */\n${css.slice(0, 4000)}\n` } : file);
    if (repaired.repairs.length) this.log.log(JSON.stringify({ event: 'v2_reassemble_repairs', storeId, repairs: repaired.repairs }));
    const input = { revision: head, label: V2_LABEL, brief: base.brief, files: withContextMenu(assembleV2Files(files, repaired.files, context.ownCards, context.ownIcons, context.cartSheet), context) } as Parameters<SourceProjectsService['save']>[2];
    const started = Date.now();
    const built = await buildInSandbox(input);
    if (!built.ok) throw new BadRequestException(`No compiló: ${built.error.slice(0, 600)}`);
    assertSourceCommerceContract(built.snapshot);
    const saved = await this.save(merchantId, storeId, baseRevision, input, built.snapshot, 'reassemble', Date.now() - started, []);
    return { revision: saved.revision, from };
  }

  /** The store's latest V2 design as written (Shell, home, product, the library slots, the design's CSS without the platform
   *  blocks), over its last template revision — what reassemble and the look start from. */
  /** The base revision's files with the store's current settings in config.js (withStoreSettings). */
  private async withSettings<T extends { path: string; content: string }>(storeId: string, files: T[]): Promise<T[]> {
    const store = await this.prisma.store?.findUnique({ where: { id: storeId }, select: { contactFormEnabled: true, slug: true } });
    if (!store) return files;
    // The shopper's shape of the popup and game settings, as the template build bakes them (source-generation catalog()).
    const row = await this.prisma.storeRetention?.findUnique({ where: { storeId }, select: { settings: true } }).catch(() => null);
    const retention = row?.settings ? publicRetentionSettings({ ...DEFAULT_RETENTION, ...(row.settings as object) }, store.slug) as Record<string, unknown> : null;
    return withStoreSettings(files as never[], { contactFormEnabled: store.contactFormEnabled, retention }) as unknown as T[];
  }

  private async latestDesign(merchantId: string, storeId: string) {
    const head = await this.latest(storeId);
    const current = (await this.projects.version(merchantId, storeId, head)).snapshot as unknown as SourceProjectSnapshot;
    const latestV2 = await this.prisma.storeSourceVersion.findFirst({ where: { storeId, label: { startsWith: V2_LABEL } }, orderBy: { revision: 'desc' }, select: { revision: true } });
    if (!latestV2) throw new BadRequestException('La tienda no tiene un diseño V2.');
    const design = latestV2.revision === head ? current : (await this.projects.version(merchantId, storeId, latestV2.revision)).snapshot as unknown as SourceProjectSnapshot;
    const pick = (path: string) => design.files.find(file => file.path === path);
    const written = ['components/Shell.tsx', 'components/home.tsx', 'components/product.tsx'].map(pick).filter((file): file is NonNullable<typeof file> => Boolean(file))
      .map(file => ({ path: file.path, content: file.content }) as V2File);
    // The library file again from its checked blocks, so the current rules (one photo each) apply to it too.
    const libraryFile = pick(V2_LIBRARY_FILE);
    if (libraryFile) {
      const read = readV2LibraryFile(libraryFile.content);
      written.push(v2LibraryFile({ blocks: withoutRepeatedPhotos(read.blocks, read.slots, ownPhotos(written)), order: read.slots, dropped: read.dropped }));
    }
    const sheet = pick('styles/globals.css')?.content ?? '';
    // Only the design's own CSS: the platform's blocks are added again when it is assembled (live 2026-11-15: DooBoo's look run was
    // refused for the layout baseline's reduced-motion !important, and the cart sheet came back twice).
    const own = sheet.replace(/\/\* v2:(kit-baseline|library|cards|cart)[\s\S]*?\/\* \/v2:\1 \*\/\n?/g, '')
      .replace(/\/\* pagosya-layout-baseline:start \*\/[\s\S]*?\/\* pagosya-layout-baseline:end \*\/\n?/g, '').trim();
    written.push({ path: 'styles/globals.css', content: own });
    const baseRevision = await this.templateBase(storeId);
    const base = (await this.projects.version(merchantId, storeId, baseRevision)).snapshot as unknown as SourceProjectSnapshot;
    const files = withV2Scaffold(await this.withSettings(storeId, base.files.filter(file => !file.path.startsWith('_compiled/'))));
    // Photos only the design has (its product cut-outs, owner 2026-11-15) come along, or its pages would point at nothing.
    const known = new Set(files.map(file => file.path));
    files.push(...design.files.filter(file => /^assets\/image-[a-f0-9]{12}\.webp$/.test(file.path) && !known.has(file.path)));
    const first = await this.prisma.storeAgentMessage.findFirst({ where: { thread: { storeId }, role: 'USER' }, orderBy: { createdAt: 'asc' }, select: { content: true } });
    const context = await v2Context(files, first?.content ?? '');
    // A look or a reassembly keeps the menu the design was saved with.
    const savedMenu = readConfigData(design.files).header?.menu;
    if (savedMenu && typeof savedMenu.model === 'string' && Array.isArray(savedMenu.groups)) context.menu = savedMenu;
    // …and its hero idea, so a look round's repairs keep the marker on home.tsx (minor M1).
    context.heroIdea = readStoreLooks(design.files).hero ?? undefined;
    return { head, from: latestV2.revision, written, base, baseRevision, files, context };
  }

  /** The newest revision that is not a V2 design (its template data and code), else the newest. */
  /** The hero ideas and menu models the merchant's latest other V2 stores use (heroes + menus plan 2026-11-15). Twenty stores are
   *  enough: with 8 ideas and 16 models, older stores would only repeat what these already show. */
  private async merchantHistory(merchantId: string, storeId: string): Promise<{ heroes: string[]; menus: string[]; headers: string[] }> {
    // Read together, and a store that cannot be read is skipped: history only steers variety, it never stops a build (minor M2).
    // The merchant's newest V2 designs, not their newest stores (a merchant with hundreds of stores would otherwise miss them).
    const recent = await this.prisma.storeSourceVersion.findMany({ where: { label: { startsWith: V2_LABEL }, storeId: { not: storeId }, project: { store: { merchantId } } }, orderBy: { createdAt: 'desc' }, take: 200, select: { storeId: true } }).catch(() => []);
    const looks = await Promise.all(newestStores(recent, 20).map(id => this.prisma.storeSourceVersion
      .findFirst({ where: { storeId: id, label: { startsWith: V2_LABEL } }, orderBy: { revision: 'desc' }, select: { snapshot: true } })
      .then(version => readStoreLooks((version?.snapshot as { files?: Array<{ path: string; content: string }> } | null)?.files))
      .catch(() => readStoreLooks(null))));
    const pick = (key: 'hero' | 'menu' | 'header') => [...new Set(looks.map(look => look[key]).filter((value): value is string => Boolean(value) && value !== 'libre'))];
    return { heroes: pick('hero'), menus: pick('menu'), headers: pick('header') };
  }

  /** The showcases the merchant's three newest other V2 designs placed. */
  private async recentShowcases(merchantId: string, storeId: string): Promise<string[]> {
    const recent = await this.prisma.storeSourceVersion.findMany({ where: { label: { startsWith: V2_LABEL }, storeId: { not: storeId }, project: { store: { merchantId } } }, orderBy: { createdAt: 'desc' }, take: 60, select: { storeId: true } });
    const homes = await Promise.all(newestStores(recent, 3).map(id => this.prisma.storeSourceVersion.findFirst({ where: { storeId: id, label: { startsWith: V2_LABEL } }, orderBy: { revision: 'desc' }, select: { snapshot: true } })
      .then(version => readShowcases((version?.snapshot as { files?: Array<{ path: string; content: string }> } | null)?.files)).catch(() => [] as string[])));
    return [...new Set(homes.flat())];
  }

  private async templateBase(storeId: string): Promise<number> {
    const version = await this.prisma.storeSourceVersion.findFirst({ where: { storeId, NOT: { label: V2_LABEL } }, orderBy: { revision: 'desc' }, select: { revision: true } }).catch(() => null);
    return version?.revision ?? this.latest(storeId);
  }

  private async latest(storeId: string): Promise<number> {
    const project = await this.prisma.storeSourceProject.findUnique({ where: { storeId }, select: { revision: true } });
    if (!project) throw new BadRequestException('La tienda no tiene diseño todavía.');
    return project.revision;
  }

  private async run(merchantId: string, storeId: string, revision: number, references: string[], state: V2RunState, restyleCards = false, animated = false) {
    const started = Date.now();
    const stage = async <T>(name: string, work: () => Promise<T>, detail?: (value: T) => unknown): Promise<T> => {
      const t0 = Date.now(); const value = await work();
      state.stages.push({ stage: name, ms: Date.now() - t0, ...(detail ? { detail: detail(value) } : {}) });
      this.log.log(JSON.stringify({ event: 'v2_prototype_stage', storeId, stage: name, ms: Date.now() - t0 }));
      return value;
    };
    const base = (await this.projects.version(merchantId, storeId, revision)).snapshot as unknown as SourceProjectSnapshot;
    const files = withV2Scaffold(await this.withSettings(storeId, base.files.filter(file => !file.path.startsWith('_compiled/'))));
    const first = await this.prisma.storeAgentMessage.findFirst({ where: { thread: { storeId }, role: 'USER' }, orderBy: { createdAt: 'asc' }, select: { content: true } });
    const context = await v2Context(files, first?.content ?? '');
    // Product cards are the platform's unless the merchant asked for their own (in words, or the route's restyleCards).
    if (restyleCards) context.ownCards = true;
    context.free = state.free ?? this.config.get<boolean>('app.yapiV2Free') === true;
    // Loose mode: the design owns the cards too, and only what keeps the store working is checked.
    if (state.loose) { context.loose = true; context.free = true; context.ownCards = true; }
    if (state.basic) { context.basic = true; context.free = true; }
    // The creative setting stands on the Nov 14 rules (own menu, basic checks) and swaps the average-store rules for invention.
    if (state.creative) { context.creative = true; context.basic = true; context.free = true; }
    if (animated) context.animated = true;
    // Owner 2026-11-15 (Amboras's showcase examples): the products' photos without their background, for the stage and the rail.
    const cut = await stage('cutouts', () => this.productCutouts(storeId, files, state.model || this.config.get<string>('app.yapiV2Model') || 'gpt-5.6-sol', state), result => result.cutouts.length);
    files.push(...cut.files);
    context.cutouts = cut.cutouts;
    const libraryPhotos = context.basic || context.loose ? { added: 0, sector: null as string | null } : await this.topUpLibraryPhotos(merchantId, storeId, files).catch(error => {
      this.log.warn(JSON.stringify({ event: 'v2_library_photos_failed', storeId, error: String((error as Error)?.message ?? error) }));
      return { added: 0, sector: null as string | null };
    });
    const own = await this.storePhotos(merchantId, storeId, files);
    files.push(...own.files);
    context.photos.push(...own.photos);
    await this.markProductPhotos(files, context);
    await this.markWordPhotos(storeId, files, context, state);
    // Owner 2026-11-16: the showcases rotate — one the merchant's last three stores placed is not offered (nor its examples).
    context.showcasesUsed = await this.recentShowcases(merchantId, storeId).catch(() => [] as string[]);
    const showcaseFiles = cut.cutouts.length >= 2 ? await readdir(join(referencesDir(), '_showcase')).then(names => Promise.all(names.filter(name => /\.jpe?g$/.test(name)).sort().slice(0, 6)
      .map(async name => ({ name, shot: { type: 'input_image', image_url: `data:image/jpeg;base64,${(await readFile(join(referencesDir(), '_showcase', name))).toString('base64')}`, detail: 'low' } as Content })))).catch(() => []) : [];
    const showcaseOffered = (name: string) => !(context.showcasesUsed ?? []).includes(/atelier|rail/.test(name) ? 'rail' : 'stage');
    const showcaseShots = showcaseFiles.filter(entry => showcaseOffered(entry.name)).map(entry => entry.shot);
    // The half that may place the stage sees the stage examples; the other the rail (examples/v2-proto/references/_showcase).
    const railShots = showcaseFiles.filter(entry => /atelier|rail/.test(entry.name) && showcaseOffered(entry.name)).map(entry => entry.shot);
    const stageShots = showcaseFiles.filter(entry => !/atelier|rail/.test(entry.name) && showcaseOffered(entry.name)).map(entry => entry.shot);
    // The cut-outs themselves, small, so the writer picks the clean ones (the model is not perfect).
    const cutoutShots: Content[] = cut.cutouts.length >= 2 ? [{ type: 'input_text', text: 'LOS RECORTES (en el orden de la lista RECORTES DE PRODUCTO):' },
      ...cut.cutouts.flatMap((cutout): Content[] => { const file = cut.files.find(entry => entry.path === cutout.path); return file ? [{ type: 'input_text', text: `${cutout.path}${cutout.what ? ` — ${cutout.what}` : ''}:` }, { type: 'input_image', image_url: `data:image/webp;base64,${file.content}`, detail: 'low' }] : []; })] : [];
    const showcaseIntro: Content = { type: 'input_text', text: 'VITRINAS DE REFERENCIA (tiendas de ejemplo de Amboras: LIFT con un sabor por pantalla, ATELIER con prendas en un riel; su oficio, nunca sus colores, textos ni fotos):' };
    state.ownCards = context.ownCards;
    const photos = (await Promise.all(context.photos.slice(0, 6).map(photo => photoDataUrl(files, photo.path)))).filter((url): url is string => Boolean(url));
    // The facts section fill uses, with the V2 photo list (block photo numbers = the writer's photo order).
    const libraryFacts = v2LibraryFacts(await this.chat.libraryFacts(merchantId, storeId, files, context.request, 14), context);
    const lib: V2Lib = { entries: [], facts: libraryFacts };
    // Owner 2026-11-14 («learn from real ecommerce stores»): with no reference asked for, the closest real stores of the library —
    // the lead drawn per store among the close ones, the second from another mood (one store's structure, another's touch).
    const library = references.length ? [] : pickReferences(context, 3, storeId);
    state.references = library.length ? library.map(ref => ref.host) : references;
    const shots: Content[] = await stage('reference', async () => library.length
      ? (await Promise.all(library.map((ref, i) => this.referenceShots(ref, i === 0)))).flat()
      // A remix sees the whole home of its site (six screens), not just its opening.
      : (await this.captureReferences(references, state.remix ? [0, 900, 1800, 2700, 3600, 4500] : undefined)).map((image_url): Content => ({ type: 'input_image', image_url, detail: 'high' })), list => list.length);
    const remixHost = state.remix ? new URL(state.remix).host.replace(/^www\./, '') : '';
    // Every writer call of a remix sees the site (small) and what a remix keeps of it.
    const looseRemixShots: Content[] = state.remix && state.loose ? [{ type: 'input_text', text: ownRemix(remixLooseText(remixHost), state.ownSite) } as Content, ...shots] : [];
    const remixShots: Content[] = state.remix ? [{ type: 'input_text', text: ownRemix(remixWriterText(remixHost), state.ownSite) } as Content, ...shots.map(shot => shot.type === 'input_image' ? { ...shot, detail: 'low' as const } : shot)] : [];
    // Their recipe cards (written once by the study route): words the direction and the writer can follow, cheaper than pictures.
    const cards = (await Promise.all(library.map(ref => this.card(ref.host)))).map((card, i) => card && cardText(card, i === 0)).filter((text): text is string => Boolean(text));
    const study: Content[] = cards.length ? [{ type: 'input_text', text: `FICHAS DE ESTUDIO DE ESAS TIENDAS (la primera es la referencia principal: sigue su ESTRUCTURA — orden de secciones, forma de la cabecera, tarjeta de producto, caja de compra, cómo se recompone en el teléfono — adaptada a esta marca y a sus fotos; de las demás toma solo un toque. Nunca sus colores, textos, logos ni fotos):\n\n${cards.join('\n\n')}` }] : [];
    state.cards = cards.length;
    // Owner 2026-11-14 («lets try creating an animated store» + the Dribbble mushroom-coffee shot): an animated store sees the
    // animated reference's frames (examples/v2-proto/references/_animated) in its direction and in each half of its home.
    const motionShots: Content[] = context.animated ? await readdir(join(referencesDir(), '_animated')).then(names => Promise.all(names.filter(name => /\.jpe?g$/.test(name)).sort().slice(0, 8)
      .map(async name => ({ type: 'input_image', image_url: `data:image/jpeg;base64,${(await readFile(join(referencesDir(), '_animated', name))).toString('base64')}`, detail: 'low' } as Content)))).catch(() => []) : [];
    // Owner 2026-11-15 («fuller homogeneous stores like this product page»): in free mode the product writer sees the Brightland
    // product page as the bar (examples/v2-proto/references/_product).
    const productShots: Content[] = context.free ? await readdir(join(referencesDir(), '_product')).then(names => Promise.all(names.filter(name => /\.jpe?g$/.test(name)).sort().slice(0, 4)
      .map(async name => ({ type: 'input_image', image_url: `data:image/jpeg;base64,${(await readFile(join(referencesDir(), '_product', name))).toString('base64')}`, detail: 'low' } as Content)))).catch(() => []) : [];
    // The design-system writer sees only the closest reference's first screen (live 2026-11-14: with every reference the call ran
    // past the bridge's 10 minutes); the art direction already studied them all.
    const firstScreens = shots.slice(0, 2).filter(entry => entry.type === 'input_text' || (entry.type === 'input_image' && entry.detail === 'high'));
    const model = state.model || this.config.get<string>('app.yapiV2Model') || 'gpt-5.6-sol';
    state.model = model;
    // Heroes + menus plan 2026-11-15: never the hero idea or the menu model this merchant's other stores already use; about one
    // store in three gets the open hero brief instead of a listed idea.
    const history = await this.merchantHistory(merchantId, storeId);
    // A remix takes its first screen from the site it remixes, not from a hero idea.
    context.heroesAllowed = state.remix || context.basic || drawsLibre(storeId) ? ['libre'] : allowedHeroIdeas(history.heroes, context);
    context.menusAllowed = allowedMenus(history.menus);
    context.headersUsed = history.headers;
    // Owner 2026-11-17: the creative setting first proposes 3 concepts and builds the boldest its photos can carry.
    if (context.creative) {
      const picked = await stage('concepts', () => this.call<{ concepts?: Array<{ name: string; idea: string; layout: string; signature: string; motion: string }>; pick?: number; why?: string }>(storeId, 'v2-concepts', model, V2_CONCEPT_PROMPT,
        [{ type: 'input_text', text: v2DirectionInput(context) }, ...photos.map((image_url): Content => ({ type: 'input_image', image_url, detail: 'low' }))], v2ConceptSchema(), 'v2_concepts', 6_000, state, 'medium'));
      const chosen = picked?.concepts?.[picked.pick ?? 0] ?? picked?.concepts?.[0];
      if (chosen) { context.concept = `${chosen.name}: ${chosen.idea}\nPortada: ${chosen.layout}\nMomento firma: ${chosen.signature}\nMovimiento: ${chosen.motion}`; state.concept = { name: chosen.name, idea: chosen.idea, why: picked?.why ?? '' }; }
    }
    // Loose mode has no art direction call: the writer designs everything (a remix copies its site).
    const direction = context.loose ? ({} as V2Direction) : await stage('direction', () => this.call<V2Direction>(storeId, 'v2-direction', model, v2DirectionPrompt(context.free), [
      { type: 'input_text', text: `${v2DirectionInput(context)}${context.animated ? `\n\n${ANIMATED_RULES}` : ''}` },
      ...photos.map((image_url): Content => ({ type: 'input_image', image_url, detail: 'high' })),
      ...(shots.length ? [{ type: 'input_text', text: state.remix ? ownRemix(remixDirectionText(remixHost), state.ownSite) : 'TIENDAS REALES DE REFERENCIA (aprende su oficio — retícula, tipografía, aire, cómo muestran el producto —, nunca copies sus colores ni sus textos):' } as Content] : []),
      ...shots,
      ...study,
      ...(motionShots.length ? [{ type: 'input_text', text: 'REFERENCIA DE MOVIMIENTO Y OFICIO PARA ESTA TIENDA ANIMADA (una tienda Shopify animada; aprende su oficio, nunca sus colores, textos ni fotos):' } as Content, ...motionShots] : []),
      ...(showcaseShots.length ? [showcaseIntro, ...showcaseShots, ...cutoutShots] : []),
    ], v2DirectionSchema(context), 'v2_direction', 12_000, state, 'medium'));
    if (!direction) throw new Error('la dirección de arte no llegó');
    state.direction = direction;
    // The store's menu as the direction chose it (spec 2026-11-15 store menu models): checked by the contract, written into config.js.
    // Cleaned in code (final review C1): a menu the writer cannot change never blocks the build.
    // The Nov 14 rule set had no menu models, hero ideas or header looks: the kit's own menu and header.
    context.menu = direction.menu && !context.basic ? cleanMenu(direction.menu, context) : undefined;
    context.heroIdea = context.basic ? undefined : direction.hero?.idea;
    context.header = context.basic ? undefined : direction.header;
    // The chosen idea's real reference frames go to the half that writes the hero (examples/v2-proto/references/_heroes).
    const heroShots: Content[] = await Promise.all((heroIdea(context.heroIdea)?.frames ?? []).map(async frame => {
      const bytes = await readFile(join(referencesDir(), '_heroes', frame)).catch(() => null);
      return bytes ? { type: 'input_image', image_url: `data:image/${frame.endsWith('.webp') ? 'webp' : 'jpeg'};base64,${bytes.toString('base64')}`, detail: 'low' } as Content : null;
    })).then(shots => shots.filter((shot): shot is Content => Boolean(shot)));
    // The cart drawer's look, as the direction chose it for this store (owner 2026-11-14 «depends on the store»).
    context.cartSheet = v2CartSheet(direction.cart?.look, context.storeName, direction.cart?.photo);
    // Written parts kept between rounds until a whole first version is put together (see write below).
    const kept: { system?: NonNullable<ReturnType<typeof readV2Part>>; a?: NonNullable<ReturnType<typeof readV2Half>>; b?: NonNullable<ReturnType<typeof readV2Half>>; product?: NonNullable<ReturnType<typeof readV2Part>> } = {};
    // Owner 2026-11-18 («look at graza login page and etc that should also be copied»): a remix also copies the site's login look
    // and its not-found page, written beside the home and put into the store before its first build.
    const extras = state.remix ? this.remixExtras(storeId, model, state, context, direction).catch(error => {
      this.log.warn(JSON.stringify({ event: 'v2_extras_failed', storeId, error: String((error as Error)?.message ?? error).slice(0, 300) }));
      return null;
    }) : Promise.resolve(null);
    let extrasPlaced = false;
    const withExtras = async (written: V2File[] | null): Promise<V2File[] | null> => {
      const got = written && await extras;
      if (!written || !got) return written;
      if (!extrasPlaced) {
        extrasPlaced = true;
        const config = files.findIndex(file => file.path === 'config.js');
        if (got.theme && config >= 0) files[config] = snapshotWithAccountTheme({ files: [files[config]] }, got.theme).files[0] as typeof files[number];
        if (got.notFound) { const at = files.findIndex(file => file.path === 'components/pages/not-found.tsx'); const page = { path: 'components/pages/not-found.tsx', content: got.notFound } as typeof files[number]; if (at >= 0) files[at] = page; else files.push(page); }
        state.extras = { login: got.theme?.layout ?? null, notFound: Boolean(got.notFound) };
      }
      return got.css ? written.map(file => file.path === 'styles/globals.css' && !file.content.includes('/* v2:remix-extras */') ? { ...file, content: `${file.content}\n/* v2:remix-extras */\n${got.css}\n/* /v2:remix-extras */\n` } : file) : written;
    };
    const built = await stage('write+build', () => runV2Build({ revision, brief: base.brief, files }, context, V2_LABEL, {
      // Two calls (design system, then pages) so each fits the bridge's 10-minute request; a call that times out or fails is a
      // failed attempt the loop retries, a spent quota stops the run.
      write: async (feedback, previous) => withExtras(await (async () => {
        const ask = async (part: V2Part, system?: V2File[]) => {
          try {
            return readV2Part(await this.call(storeId, `v2-writer-${part}`, model, v2WriterPrompt(context.free, context.loose), [
              { type: 'input_text', text: v2WriterInput(context, direction, part, feedback, previous, system, { facts: v2LibraryFactsText(libraryFacts) }) },
              ...(part === 'system' ? photos.slice(0, 4).map((image_url): Content => ({ type: 'input_image', image_url, detail: 'low' })) : []),
              ...(part === 'system' && firstScreens.length ? [{ type: 'input_text', text: 'El nivel de oficio a alcanzar (tiendas reales; no copies sus colores ni sus textos):' } as Content,
                ...firstScreens.map(entry => entry.type === 'input_image' ? { ...entry, detail: 'low' as const } : entry)] : []),
              ...(context.loose ? looseRemixShots : part !== 'system' ? remixShots : state.remix ? remixShots.slice(0, 1) : []),
              ...study,
              ...(part === 'pages' && showcaseShots.length ? [showcaseIntro, ...showcaseShots, ...cutoutShots] : []),
              ...(part !== 'system' && productShots.length ? [{ type: 'input_text', text: 'LA VARA DE LA PÁGINA DE PRODUCTO (Brightland; su oficio, nunca sus colores, textos ni fotos):' } as Content, ...productShots] : []),
            ], v2WriterSchema(part, context.photos.length), `v2_${part}`, 40_000, state, 'medium'), part);
          } catch (error) {
            if (spent(error)) throw error;
            this.log.warn(JSON.stringify({ event: 'v2_writer_failed', storeId, part, reason: String((error as Error)?.message ?? error).slice(0, 300) }));
            return null;
          }
        };
        // A version that came back with problems: only the named sections are rewritten, else one short call fixes what failed.
        if (previous?.length && feedback.length) return this.fixRound(storeId, model, context, state, lib, feedback, previous);
        // Live 2026-11-15 (Oh Belly: the design system written four times because half b or the product page timed out): the parts
        // that came back are kept, and the next round asks only for the missing ones.
        const system = kept.system ?? await ask('system');
        if (!system) return null;
        kept.system = system;
        let pages: { files: V2File[]; css: string; library: V2LibraryEntry[] } | null;
        if (context.free && !context.loose && process.env.YAPI_V2_SPLIT === '1') {
          // Owner 2026-11-14 (step 2, «faster»): the home in two halves and the product page, three short calls at the same time.
          const half = async (which: V2Half) => {
            try {
              return readV2Half(await this.call(storeId, `v2-writer-half-${which}`, model, v2WriterPrompt(true), [{ type: 'input_text', text: v2HalfInput(context, direction, which, system.files, { facts: v2LibraryFactsText(libraryFacts) }) }, ...study, ...motionShots.slice(0, 4),
                ...(showcaseShots.length ? [showcaseIntro, ...(which === 'a' ? stageShots : railShots), ...cutoutShots] : []), ...remixShots, ...(which === 'a' && heroShots.length ? [{ type: 'input_text', text: 'REFERENCIAS DE LA IDEA DE PORTADA (aprende la composición y el movimiento, nunca colores, textos ni fotos):' } as Content, ...heroShots] : [])],
                v2HalfSchema(context.photos.length), `v2_half_${which}`, 24_000, state, 'medium'));
            } catch (error) {
              if (spent(error)) throw error;
              this.log.warn(JSON.stringify({ event: 'v2_writer_failed', storeId, part: `half-${which}`, reason: String((error as Error)?.message ?? error).slice(0, 300) }));
              return null;
            }
          };
          const started = Date.now();
          const [a, b, product] = await Promise.all([kept.a ?? half('a'), kept.b ?? half('b'), kept.product ?? ask('product', system.files)]);
          Object.assign(kept, { a: a ?? undefined, b: b ?? undefined, product: product ?? undefined });
          this.log.log(JSON.stringify({ event: 'v2_split_write', storeId, ms: Date.now() - started, a: Boolean(a), b: Boolean(b), product: Boolean(product) }));
          pages = a && b && product ? { files: [{ path: 'components/home.tsx', content: composeV2Home(a, b) }, ...product.files], css: [a.css, b.css, product.css].filter(css => css.trim()).join('\n\n'), library: [...a.library, ...b.library] } : null;
        } else pages = await ask('pages', system.files);
        if (!pages) return null;
        for (const key of Object.keys(kept) as Array<keyof typeof kept>) delete kept[key];
        // The library sections the home places, checked as section fill checks them, as the generated components/v2-library.tsx.
        lib.entries = pages.library;
        const library = buildV2Library(lib.entries, libraryFacts, context, ownPhotos(pages.files));
        state.library = { slots: library.order, dropped: library.dropped };
        return [...joinV2Parts(system, pages), v2LibraryFile(library)];
      })()),
      ...this.loopChecks(storeId, model, context, state),
      // Free mode (owner 2026-11-14: Meat House r4 was saved with its problems after 4 attempts, 2 spent on a missing slot and a prop):
      // more rounds to fix what the page checks find.
      ...(context.free ? { attempts: Number(process.env.YAPI_V2_ATTEMPTS) > 0 ? Number(process.env.YAPI_V2_ATTEMPTS) : 6 } : {}),
    }), result => result.attempts.map(attempt => `${attempt.attempt}:${attempt.outcome}`));
    if (!built.ok) throw new Error(`no se pudo compilar en ${built.attempts.length} intentos: ${built.attempts.at(-1)?.problems.join(' · ').slice(0, 600)}`);
    const checks = await stage('checks', async () => {
      const rules = (await templateQaFindings(built.snapshot)).map(({ width, blocking }) => ({ width, blocking }));
      const shopping = await probeSourceShopping(built.snapshot).catch(error => ({ error: String((error as Error)?.message ?? error) }));
      const signature = await this.signature(built.snapshot);
      const templateSignature = await this.signature(base);
      return { rules, shopping, signature, templateSignature, distanceFromTemplate: signatureDistance(signature, templateSignature) };
    });
    state.checks = checks;
    const saved = await stage('save', () => this.save(merchantId, storeId, revision, built.input, built.snapshot, model, Date.now() - started, built.attempts));
    state.revision = saved.revision; state.status = 'DONE';
    await this.postLookDone(storeId, state, saved.revision);
    if (libraryPhotos.added) await this.postChat(storeId, `Agregué ${libraryPhotos.added} fotos de ambiente de nuestra biblioteca; puedes cambiarlas o quitarlas en Tienda › Medios.`, { libraryPhotos });
    this.log.log(JSON.stringify({ event: 'v2_prototype', storeId, baseRevision: revision, revision: saved.revision, ms: Date.now() - started, usd: state.usd,
      attempts: built.attempts.map(attempt => attempt.outcome), distanceFromTemplate: checks.distanceFromTemplate, blocking: checks.rules.map(rule => rule.blocking.length) }));
  }

  /** Owner 2026-11-15 («in amboras you can see in the chat their bot screenshoting the page to see if they like it»): YAPI looks at
   *  the store's latest V2 design as it is — no new design — and fixes what it sees (up to two rounds), saved as a new revision.
   *  GET reports it like a build, with each look's problems and where its screenshots were saved. */
  async startLook(merchantId: string, storeId: string, notes: readonly string[] = [], model?: string) {
    this.enabled();
    if (this.runs.get(storeId)?.status === 'RUNNING') throw new ConflictException('Ya hay un diseño V2 en curso para esta tienda.');
    await this.projects.version(merchantId, storeId, await this.latest(storeId));
    const state: V2RunState = { status: 'RUNNING', startedAt: new Date().toISOString(), stages: [], usd: 0 };
    this.runs.set(storeId, state);
    // Owner 2026-11-17: a targeted fix can run on a Claude model (paid from the Anthropic key) instead of the ChatGPT plan.
    if (model) state.model = model;
    void this.runLook(merchantId, storeId, state, notes).catch(error => {
      state.status = 'FAILED'; state.error = String((error as Error)?.message ?? error).slice(0, 1000);
      this.log.warn(JSON.stringify({ event: 'v2_look_failed', storeId, error: state.error }));
    });
    return state;
  }

  private async runLook(merchantId: string, storeId: string, state: V2RunState, notes: readonly string[] = []) {
    const started = Date.now();
    const { written, base, baseRevision, files, context } = await this.latestDesign(merchantId, storeId);
    context.free = this.config.get<boolean>('app.yapiV2Free') === true;
    state.baseRevision = baseRevision;
    // The same cut-outs the build made (same bytes, same names), so the showcase pieces can be checked and fixed.
    const cut = await this.productCutouts(storeId, files, this.config.get<string>('app.yapiV2Model') || 'gpt-5.6-sol', state);
    files.push(...cut.files.filter(file => !files.some(known => known.path === file.path)));
    context.cutouts = cut.cutouts;
    await this.markProductPhotos(files, context);
    await this.markWordPhotos(storeId, files, context, state);
    const model = state.model || this.config.get<string>('app.yapiV2Model') || 'gpt-5.6-sol';
    state.model = model;
    const read = readV2LibraryFile(written.find(file => file.path === V2_LIBRARY_FILE)?.content ?? '');
    const lib: V2Lib = {
      entries: read.slots.filter(slot => read.blocks[slot]).map(slot => ({ slot, block: read.blocks[slot] as unknown as Record<string, unknown> })),
      facts: v2LibraryFacts(await this.chat.libraryFacts(merchantId, storeId, files, context.request, 14), context),
    };
    // The first «write» is the design as saved; every later one is a fix of what the look (or the rules) found.
    let first = true;
    const built = await runV2Build({ revision: baseRevision, brief: base.brief, files }, context, V2_LABEL, {
      write: async (feedback, previous) => {
        // With notes, the first round is their fix of the saved design (the design as saved when that fix brings nothing).
        if (first) { first = false; return notes.length ? (await this.fixRound(storeId, model, context, state, lib, [...notes], written)) ?? written : written; }
        return previous?.length && feedback.length ? this.fixRound(storeId, model, context, state, lib, feedback, previous) : null;
      },
      ...this.loopChecks(storeId, model, context, state),
      // Up to three looks: the last one checks the second fix (owner 2026-11-15: «fix what is still not right» — DooBoo rev 4's
      // second fix was never looked at).
      // Two rounds of its own: the saved design can fail the current contract (live 2026-11-15, Oh Belly's photo slides), and that is
      // fixed before anything is looked at.
      // Three: a last fix that slips on one contract line gets a round to repair it instead of losing its fixes (Oh Belly r19).
      attempts: 3, looks: 3,
    });
    if (!built.ok) throw new Error(`no se pudo compilar: ${built.attempts.at(-1)?.problems.join(' · ').slice(0, 600)}`);
    const saved = await this.save(merchantId, storeId, baseRevision, built.input, built.snapshot, model, Date.now() - started, built.attempts);
    state.revision = saved.revision; state.status = 'DONE';
    await this.postLookDone(storeId, state, saved.revision);
    this.log.log(JSON.stringify({ event: 'v2_look_run', storeId, revision: saved.revision, ms: Date.now() - started, usd: state.usd, attempts: built.attempts.map(attempt => attempt.outcome) }));
  }

  /** One fix round of a written design. Owner 2026-11-14 («faster, cheaper, more reliable»): problems that each name one of the
   *  home's own sections are fixed by rewriting only those sections, with light thinking; anything else (or a section answer that
   *  cannot be placed) goes to one short call that fixes only what failed — the design stays as it was. */
  private async fixRound(storeId: string, model: string, context: V2Context, state: V2RunState, lib: V2Lib, feedback: string[], previous: V2File[]): Promise<V2File[] | null> {
    const plan = context.free && !context.loose ? sectionFixPlan(previous, feedback) : null;
    if (plan) {
      try {
        const raw = await this.call(storeId, 'v2-writer-section-fix', model, v2SectionFixPrompt(v2WriterPrompt(context.free)), [{ type: 'input_text', text: v2SectionFixInput(plan, previous) }],
          v2SectionFixSchema(), 'v2_section_fix', 16_000, state, 'low');
        const merged = mergeSectionFix(previous, plan, raw);
        this.log.log(JSON.stringify({ event: 'v2_section_fix', storeId, sections: plan.sections.map(section => section.index), placed: Boolean(merged) }));
        if (merged) return merged;
      } catch (error) {
        if (spent(error)) throw error;
        this.log.warn(JSON.stringify({ event: 'v2_writer_failed', storeId, part: 'section-fix', reason: String((error as Error)?.message ?? error).slice(0, 300) }));
      }
    }
    try {
      const raw = await this.call<{ library?: unknown }>(storeId, 'v2-writer-fix', model, v2FixPrompt(context.free, context.loose), [{ type: 'input_text', text: v2FixInput(previous, feedback, feedback.some(line => /biblioteca|LibrarySlot/.test(line)) ? { entries: lib.entries, facts: v2LibraryFactsText(lib.facts) } : undefined) }],
        v2FixSchema(context.photos.length), 'v2_fix', 40_000, state, 'medium');
      // Library sections the fix swapped or added: merged by slot, checked again, the generated file rebuilt.
      const changed = Array.isArray(raw?.library) ? (raw!.library as V2LibraryEntry[]).filter(entry => entry && typeof entry.block === 'object') : [];
      const merged = mergeV2Fix(previous, raw, changed.length > 0);
      if (!merged || !changed.length) return merged;
      lib.entries = mergeV2LibraryEntries(lib.entries, changed);
      const library = buildV2Library(lib.entries, lib.facts, context, ownPhotos(merged));
      state.library = { slots: library.order, dropped: library.dropped };
      return [...merged.filter(file => file.path !== V2_LIBRARY_FILE), v2LibraryFile(library)];
    } catch (error) {
      if (spent(error)) throw error;
      this.log.warn(JSON.stringify({ event: 'v2_writer_failed', storeId, part: 'fix', reason: String((error as Error)?.message ?? error).slice(0, 300) }));
      return null;
    }
  }

  /** What every V2 build loop checks with: repairs, the sandbox, the page rules, the commerce contract and YAPI's own look. */
  private loopChecks(storeId: string, model: string, context: V2Context, state: V2RunState): Omit<V2BuildDeps, 'write'> {
    return {
      onAttempt: attempt => {
        state.attempts = [...(state.attempts ?? []), attempt];
        this.log.log(JSON.stringify({ event: 'v2_prototype_attempt', storeId, ...attempt, problems: attempt.problems.map(line => line.slice(0, 300)) }));
      },
      repair: files => v2Repairs(files, context),
      build: input => buildInSandbox(input),
      // Owner 2026-11-16: photos over the size rule are capped in code (v2-settle), not sent back to the writer.
      settle: async (snapshot, files) => context.loose || context.basic ? null : withPhotoCaps(files, await measureHugePhotos(snapshot), new Set((context.cutouts ?? []).map(cut => cut.path))),
      // The home looked at on a desktop and a phone (the template rules: words over words, words split, overflow, repeated photos…).
      // The template rules' hint «o muestra los productos (data-pagosya-catalog …)» sent the writer into repeating product rows
      // (live 2026-11-14: BOXY, rhode, Pawby); for V2 a section of words gets a store photo or goes.
      // Free mode (owner 2026-11-14, like Amboras's advisory checks): only real breakage blocks; taste rules stay out of the loop.
      inspect: async snapshot => [...await this.pageRules(snapshot, context, state), ...await this.stickyCheck(snapshot)],
      commerce: snapshot => { try { assertSourceCommerceContract(snapshot); return null; } catch (error) { return String((error as { response?: { message?: string } })?.response?.message ?? (error as Error)?.message ?? error); } },
      // Owner 2026-11-15 (like Amboras's bot screenshotting its page): YAPI looks at what it built. YAPI_V2_LOOK=0 turns it off.
      ...(process.env.YAPI_V2_LOOK === '0' || context.loose || context.basic ? {} : { look: (snapshot: SourceProjectSnapshot, attempt: number) => this.lookAt(storeId, model, context, state, snapshot, attempt) }),
    };
  }

  /** The page rules of a V2 build on its home (desktop and phone), as fix lines. */
  private async pageRules(snapshot: SourceProjectSnapshot, context: V2Context, state: V2RunState): Promise<string[]> {
    // Owner 2026-11-16 («sections that leave a lot of empty space»): the empty-section check (advice elsewhere) sends loose and Nov 14 builds back too.
    if (context.basic || context.loose) {
      const widths = await templateQaFindings(snapshot);
      return widths.flatMap(({ width, findings }) => findings.filter(f => f.rule === 'empty-section' || (!context.loose && f.severity === 'block' && BASIC_BLOCKERS.has(f.rule))).map(f => `${width === 390 ? 'Celular' : 'Escritorio'}: ${typeof f.part === 'number' ? `[sección ${f.part}] ` : ''}${v2Hint(f.line.replace(/^(BLOQUEA|CONSEJO):\s*/, '')).slice(0, 280)}`));
    }
    const widths = await templateQaFindings(snapshot);
    (state.inspections ??= []).push({ at: new Date().toISOString(), rules: inspectionRules(widths, Boolean(context.free)) });
    return widths.flatMap(({ width, blocking, findings }) => (context.free ? freeBlocking(findings) : blocking)
      .map(line => `${width === 390 ? 'Celular' : 'Escritorio'}: ${v2Hint(line).slice(0, 280)}`));
  }

  /** The product page scrolled step by step: a pinned column over the sections below (owner 2026-11-16, NOA r14). */
  private async stickyCheck(snapshot: SourceProjectSnapshot): Promise<string[]> {
    const id = ((readConfigData(snapshot.files as never).data?.items ?? []) as Array<{ id?: string }>)[0]?.id;
    return id ? stickyOverlapLines(snapshot, String(id)).catch(() => [] as string[]) : [];
  }

  /** Screenshots of the built pages, shown to the writer's model, its answer as check lines; the screenshots are kept on disk
   *  (examples/v2-proto/looks/<store>/<run>-a<attempt>/) so the look can be seen as the model saw it. */
  private async lookAt(storeId: string, model: string, context: V2Context, state: V2RunState, snapshot: SourceProjectSnapshot, attempt: number): Promise<string[]> {
    const started = Date.now();
    const upload = this.uploads ? (name: string) => this.uploads!.getBuffer(name) : undefined;
    const capture = await captureV2Look(snapshot, upload);
    const about = `${context.storeName}${context.tagline ? ` — ${context.tagline}` : ''}. ${context.about} Lo que pidió el comerciante: ${context.request}`.slice(0, 1500);
    const raw = await this.call<{ problems?: V2LookProblem[] }>(storeId, 'v2-look', model, v2LookPrompt(Boolean(upload)), v2LookInput(capture, about), v2LookSchema(), 'v2_look', 6_000, state, 'medium');
    const lines = v2LookLines(raw, capture);
    const dir = join(looksDir(), storeId, `${state.startedAt.replace(/[:.]/g, '-')}-a${attempt}`);
    await mkdir(dir, { recursive: true });
    await Promise.all(capture.shots.map((shot, i) => writeFile(join(dir, `${String(i).padStart(2, '0')}-${shot.label.replace(/[^\w]+/g, '-').slice(0, 40)}.jpg`), shot.jpeg)));
    state.looks = [...(state.looks ?? []), { attempt, ms: Date.now() - started, shots: capture.shots.length, dir, problems: lines }];
    this.log.log(JSON.stringify({ event: 'v2_look', storeId, attempt, ms: Date.now() - started, shots: capture.shots.length, problems: lines.map(line => line.slice(0, 200)) }));
    await this.postLook(storeId, capture, Array.isArray(raw?.problems) ? raw!.problems : [], lines.length > 0).catch(error =>
      this.log.warn(JSON.stringify({ event: 'v2_look_post_failed', storeId, reason: String((error as Error)?.message ?? error).slice(0, 200) })));
    return lines;
  }

  /** Owner 2026-11-15 («lets go for it», Amboras's showcase examples): products without their background — the server's own
   *  background-removal model (source-photo-cutout), trimmed, at most 900 px — bundled as assets/image-<hash>.webp so the stage and
   *  the rail can float them. Every photo of a product is tried, up to four, keeping two per product (owner «improve»: the clean
   *  shot is often not the first — DooBoo's first photos all have a hand in them), then the store's own photos. A photo's result and
   *  YAPI's verdict on each cut-out are kept on disk (cutoutsDir), so a fix round or a later look gets the same cut-outs under the
   *  same names without cutting or asking again. YAPI_V2_CUTOUTS=0 skips. */
  private async productCutouts(storeId: string, files: readonly { path: string; content: string; encoding?: 'utf8' | 'base64' }[], model: string, state: V2RunState): Promise<{ files: Array<{ path: string; content: string; encoding: 'base64' }>; cutouts: V2Cutout[] }> {
    const out = { files: [] as Array<{ path: string; content: string; encoding: 'base64' }>, cutouts: [] as V2Cutout[] };
    if (!this.uploads || process.env.YAPI_V2_CUTOUTS === '0') return out;
    const items = (readConfigData(files as never).data?.items ?? []) as Array<{ id: string; name: string; imageUrls?: unknown[] }>;
    const cutModel = join(this.config.get<string>('app.uploadsDir') ?? 'uploads', '..', 'models', 'isnet-general-use.onnx');
    const refused: Record<string, number> = {};
    // The products' photos, then the store's own (live 2026-11-15, Oh Belly: one soda product, its five flavours only in the store's
    // photos — the stage showed four of them with their backgrounds).
    const sources: Array<{ product: string; name: string; read: () => Promise<Buffer | null> }> = [];
    for (const item of items.slice(0, 8))
      for (const url of (Array.isArray(item.imageUrls) ? item.imageUrls : []).slice(0, 4)) {
        const filename = /^\/v1\/uploads\/([\w-]+\.(?:png|jpe?g|webp))$/i.exec(uploadPath(String(url ?? '')))?.[1];
        if (filename) sources.push({ product: item.id, name: String(item.name ?? ''), read: () => this.uploads!.getBuffer(filename) });
      }
    for (const file of files.filter(entry => /^assets\/[\w.-]+\.(?:jpe?g|png)$/i.test(entry.path) && entry.encoding === 'base64').slice(0, 10))
      sources.push({ product: '', name: '(foto de la tienda)', read: async () => Buffer.from(file.content, 'base64') });
    await mkdir(cutoutsDir(), { recursive: true });
    const perProduct = new Map<string, number>();
    for (const source of sources) {
      if (out.cutouts.length >= 14) break;
      if (source.product && (perProduct.get(source.product) ?? 0) >= 2) continue;
      try {
        const original = await source.read();
        if (!original) continue;
        const made = await this.cutoutOf(original, cutModel);
        if ('reject' in made) { refused[made.reject] = (refused[made.reject] ?? 0) + 1; continue; }
        const path = `assets/image-${createHash('sha256').update(made.data).digest('hex').slice(0, 12)}.webp`;
        if (out.files.some(file => file.path === path)) continue;
        out.files.push({ path, content: made.data.toString('base64'), encoding: 'base64' });
        out.cutouts.push({ path, product: source.product, name: source.name, width: made.width, height: made.height });
        if (source.product) perProduct.set(source.product, (perProduct.get(source.product) ?? 0) + 1);
      } catch (error) {
        this.log.warn(JSON.stringify({ event: 'v2_cutout_failed', storeId, product: source.product, reason: String((error as Error)?.message ?? error).slice(0, 200) }));
      }
    }
    const vetted = await this.vetCutouts(storeId, out, model, state);
    const cutouts = vetted.cutouts.slice(0, 12);
    this.log.log(JSON.stringify({ event: 'v2_cutouts', storeId, tried: sources.length, made: out.cutouts.length, kept: cutouts.length, refused, seen: vetted.bad }));
    return { files: out.files.filter(file => cutouts.some(cutout => cutout.path === file.path)), cutouts };
  }

  /** Owner 2026-11-15 («there are some repeated things», Oh Belly rev 18): a store photo that is a product's own photo saved again
   *  (the can among lemons, the fridge, the gift boxes) already shows in that product's card; the writer is told so, and a store that
   *  has little else gets fewer chapters (freeMin) instead of the same picture three times. */
  /** Owner 2026-11-15 (DooBoo r10): which store photos carry words, a logo or packaging text — one low-detail look for the photos not
   *  seen yet, the answer kept per photo (cutoutsDir/<hash>.words.json) so later rounds and rebuilds never ask again. YAPI_V2_WORDS=0
   *  skips; a failed look leaves the photos unmarked (nothing blocks). */
  private async markWordPhotos(storeId: string, files: readonly { path: string; content: string; encoding?: 'utf8' | 'base64' }[], context: V2Context, state: V2RunState) {
    if (process.env.YAPI_V2_WORDS === '0' || !context.photos.length) return;
    const keyOf = (path: string) => { const file = files.find(entry => entry.path === path); return file ? createHash('sha256').update(file.content).digest('hex').slice(0, 24) : null; };
    const unknown: V2Context['photos'] = [];
    for (const photo of context.photos) {
      const key = keyOf(photo.path);
      const saved = key ? await readFile(join(cutoutsDir(), `${key}.words.json`), 'utf8').then(text => JSON.parse(text) as { words?: boolean }).catch(() => null) : null;
      if (saved && typeof saved.words === 'boolean') photo.words = saved.words; else unknown.push(photo);
    }
    if (!unknown.length) return;
    try {
      const shots = (await Promise.all(unknown.slice(0, 16).map(async photo => ({ photo, url: await photoDataUrl(files as never, photo.path, 384) })))).filter(entry => entry.url);
      if (!shots.length) return;
      // The run's own model (a Claude run never calls the ChatGPT plan; live 2026-11-16, new Remolino store).
      const model = state.model || this.config.get<string>('app.yapiV2Model') || 'gpt-5.6-sol';
      const raw = await this.call<{ words?: boolean[] }>(storeId, 'v2-words', model, wordsLookPrompt, shots.map(entry => ({ type: 'input_image', image_url: entry.url!, detail: 'low' } as Content)), wordsLookSchema(shots.length), 'v2_words', 2_000, state, 'low');
      await mkdir(cutoutsDir(), { recursive: true });
      await Promise.all(shots.map(async (entry, i) => {
        const words = raw?.words?.[i];
        if (typeof words !== 'boolean') return;
        entry.photo.words = words;
        const key = keyOf(entry.photo.path);
        if (key) await writeFile(join(cutoutsDir(), `${key}.words.json`), JSON.stringify({ words }));
      }));
    } catch (error) {
      if (spent(error)) throw error;
      this.log.warn(JSON.stringify({ event: 'v2_words_failed', storeId, reason: String((error as Error)?.message ?? error).slice(0, 200) }));
    }
  }

  /** Spec 2026-11-16 store quality, Part 1 (owner «Curated library»): a store with fewer than 12 usable photos of its own gets
   *  photos of its kind of business from the library, once — copied into its uploads like any photo the merchant adds, so
   *  storePhotos, the section library and the merchant's Medios tab all see them. No sector match, no photos. */
  private async topUpLibraryPhotos(merchantId: string, storeId: string, files: readonly { path: string; content: string }[], dir = photoLibraryDir()) {
    if (!this.uploads) return { added: 0, sector: null as string | null };
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { onboarding: true } });
    const onboarding = (store?.onboarding ?? {}) as Record<string, unknown> & { what?: string; libraryPhotos?: unknown };
    const assets = await this.prisma.mediaAsset.findMany({ where: { merchantId, storeId, mimeType: { in: ['image/jpeg', 'image/png', 'image/webp'] } }, select: { url: true }, take: 80 });
    let usable = 0;
    for (const asset of assets) {
      const filename = /([\w-]+\.(?:png|jpe?g|webp))$/i.exec(asset.url)?.[1];
      const bytes = filename ? await this.uploads.getBuffer(filename).catch(() => null) : null;
      const meta = bytes ? await sharp(bytes).metadata().catch(() => null) : null;
      if (meta?.width && meta.height && Math.max(meta.width, meta.height) >= 400) usable++;
    }
    const want = planLibraryTopUp({ usable, already: Boolean(onboarding.libraryPhotos) });
    if (!want) return { added: 0, sector: null as string | null };
    const data = (readConfigData(files as never).data ?? {}) as { categories?: Array<{ name?: string }>; items?: Array<{ name?: string }> };
    const words = [onboarding.what ?? '', ...(data.categories ?? []).map(c => c.name ?? ''), ...(data.items ?? []).map(i => i.name ?? '')].join(' · ');
    const sector = matchSector(words, await readPhotoLibrary(dir));
    if (!sector) return { added: 0, sector: null as string | null };
    let added = 0;
    for (const photo of sector.photos.slice(0, want)) {
      const bytes = await readFile(join(sector.dir, photo.file)).catch(() => null);
      if (!bytes) continue;
      const mime = /\.png$/i.test(photo.file) ? 'image/png' : /\.webp$/i.test(photo.file) ? 'image/webp' : 'image/jpeg';
      const asset = await this.uploads.saveBuffer(bytes, mime);
      await this.prisma.mediaAsset.create({ data: { merchantId, storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
      added++;
    }
    await this.prisma.store.update({ where: { id: storeId }, data: { onboarding: { ...onboarding, libraryPhotos: { sector: sector.sector, count: added, at: new Date().toISOString() } } as never } });
    return { added, sector: sector.sector };
  }

  /** Owner 2026-11-16 (The Bake Lab: «too few pictures, only the product photos»): a V2 design only had the photos bundled in its
   *  template and the product cut-outs, so the brand and lifestyle photos a merchant uploaded never reached the page. The store's own
   *  uploads come along as design photos: the ones no product uses first, then product photos, at most 14, at most 1600 px. */
  private async storePhotos(merchantId: string, storeId: string, files: readonly { path: string; content: string; encoding?: 'utf8' | 'base64' }[]) {
    const out: { files: Array<{ path: string; content: string; encoding: 'base64' }>; photos: V2Context['photos'] } = { files: [], photos: [] };
    if (!this.uploads) return out;
    const name = (url: unknown) => /^\/v1\/uploads\/([\w-]+\.(?:png|jpe?g|webp))$/i.exec(uploadPath(String(url ?? '')))?.[1];
    const items = (readConfigData(files as never).data?.items ?? []) as Array<{ imageUrls?: unknown[] }>;
    const products = new Set(items.flatMap(item => Array.isArray(item.imageUrls) ? item.imageUrls.map(name) : []).filter(Boolean));
    const assets = await this.prisma.mediaAsset.findMany({ where: { merchantId, storeId, mimeType: { in: ['image/jpeg', 'image/png', 'image/webp'] } },
      orderBy: { createdAt: 'asc' }, take: 80, select: { url: true } }).catch(() => [] as Array<{ url: string }>);
    const names = [...new Set(assets.map(asset => name(asset.url)).filter((entry): entry is string => Boolean(entry)))];
    const known = new Set(files.map(file => file.path));
    for (const filename of [...names.filter(entry => !products.has(entry)), ...names.filter(entry => products.has(entry))]) {
      if (out.photos.length >= 14) break;
      const bytes = await this.uploads.getBuffer(filename).catch(() => null);
      if (!bytes) continue;
      const made = await sharp(bytes).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true }).catch(() => null);
      if (!made || made.info.width < 400 || made.info.height < 300) continue;
      const path = `assets/image-${createHash('sha256').update(made.data).digest('hex').slice(0, 12)}.webp`;
      if (known.has(path)) continue;
      known.add(path);
      const ratio = made.info.width / made.info.height;
      out.files.push({ path, content: made.data.toString('base64'), encoding: 'base64' });
      out.photos.push({ path, width: made.info.width, height: made.info.height, shape: ratio > 1.2 ? 'wide' : ratio < 0.83 ? 'tall' : 'square' });
    }
    return out;
  }

  private async markProductPhotos(files: readonly { path: string; content: string; encoding?: 'utf8' | 'base64' }[], context: V2Context) {
    if (!this.uploads) return;
    const items = (readConfigData(files as never).data?.items ?? []) as Array<{ name: string; imageUrls?: unknown[] }>;
    const products: Array<{ name: string; hash: bigint }> = [];
    for (const item of items.slice(0, 12))
      for (const url of (Array.isArray(item.imageUrls) ? item.imageUrls : []).slice(0, 4)) {
        const filename = /^\/v1\/uploads\/([\w-]+\.(?:png|jpe?g|webp))$/i.exec(uploadPath(String(url ?? '')))?.[1];
        const bytes = filename ? await this.uploads.getBuffer(filename).catch(() => null) : null;
        if (bytes) products.push({ name: String(item.name ?? ''), hash: await pictureHash(bytes).catch(() => -1n) });
      }
    for (const photo of context.photos) {
      const file = files.find(entry => entry.path === photo.path && entry.encoding === 'base64');
      if (!file) continue;
      const hash = await pictureHash(Buffer.from(file.content, 'base64')).catch(() => -1n);
      const match = hash >= 0n ? products.find(product => product.hash >= 0n && samePicture(product.hash, hash)) : undefined;
      if (match) photo.product = match.name;
    }
  }

  /** One photo's cut-out at its final size, or why it gives none — from disk when the same photo (same bytes) was cut before. */
  private async cutoutOf(original: Buffer, cutModel: string): Promise<{ data: Buffer; width: number; height: number } | { reject: string }> {
    const key = join(cutoutsDir(), `${createHash('sha256').update(original).digest('hex').slice(0, 24)}-isnet`);
    const known = await readFile(`${key}.webp`).catch(() => null);
    if (known) { const meta = await sharp(known).metadata(); return { data: known, width: meta.width ?? 0, height: meta.height ?? 0 }; }
    const before = await readFile(`${key}.none`, 'utf8').catch(() => null);
    if (before) return { reject: before.trim() || 'cover' };
    const made = await productCutout(original, cutModel);
    if (made.cut) {
      const { data, info } = await sharp(made.cut).trim().resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer({ resolveWithObject: true });
      if (info.width >= 160 && info.height >= 160) { await writeFile(`${key}.webp`, data); return { data, width: info.width, height: info.height }; }
    }
    const reject = made.reject ?? 'small';
    await writeFile(`${key}.none`, reject);
    return { reject };
  }

  /** Owner 2026-11-15 («sometimes it cuts it out not good»): YAPI looks at the cut-outs before any design gets them, drops what a
   *  rule cannot see — a frame kept from the photo (a keyhole, a card, a collage), a logo or loose letters over it, half a person, a
   *  stray hand — and says what each good one shows («lata Lemon · Ginger»), so a stage screen is named after what it shows (Oh
   *  Belly rev 18: one Lemon · Ginger can on five flavour screens). Verdicts are kept per cut-out; only new cut-outs are shown. If
   *  the look fails the cut-outs stay, unnamed (the measured checks already ran). */
  private async vetCutouts(storeId: string, made: { files: Array<{ path: string; content: string; encoding: 'base64' }>; cutouts: V2Cutout[] }, model: string, state: V2RunState) {
    if (made.cutouts.length < 2 || process.env.YAPI_V2_CUTOUT_LOOK === '0') return { cutouts: made.cutouts, bad: [] as string[] };
    type Verdict = { ok: boolean; what: string; why: string };
    const verdictFile = (path: string) => join(cutoutsDir(), `${path.replace(/^assets\/image-|\.webp$/g, '')}.look.json`);
    const verdicts = new Map<string, Verdict>();
    for (const cutout of made.cutouts) {
      const known = await readFile(verdictFile(cutout.path), 'utf8').then(text => JSON.parse(text) as Verdict).catch(() => null);
      if (known) verdicts.set(cutout.path, known);
    }
    const unseen = made.cutouts.filter(cutout => !verdicts.has(cutout.path));
    if (unseen.length) try {
      const content: Content[] = [{ type: 'input_text', text: `${unseen.length} recortes, en orden:` }];
      for (const [i, cutout] of unseen.entries()) {
        const file = made.files.find(entry => entry.path === cutout.path);
        if (!file) continue;
        const shown = await sharp(Buffer.from(file.content, 'base64')).resize(512, 512, { fit: 'inside' }).flatten({ background: '#e9e9e9' }).jpeg({ quality: 80 }).toBuffer();
        content.push({ type: 'input_text', text: `Recorte ${i + 1}${cutout.name ? ` (${cutout.name})` : ''}:` }, { type: 'input_image', image_url: `data:image/jpeg;base64,${shown.toString('base64')}`, detail: 'low' });
      }
      const raw = await this.call<{ cutouts?: Array<{ n: number; ok: boolean; what: string; why: string }> }>(storeId, 'v2-cutouts', model, CUTOUT_LOOK_PROMPT, content,
        { type: 'object', additionalProperties: false, required: ['cutouts'], properties: { cutouts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'ok', 'what', 'why'],
          properties: { n: { type: 'integer' }, ok: { type: 'boolean' }, what: { type: 'string' }, why: { type: 'string' } } } } } },
        'v2_cutouts', 2_000, state, 'low');
      for (const entry of raw?.cutouts ?? []) {
        const cutout = Number.isInteger(entry.n) ? unseen[entry.n - 1] : undefined;
        if (!cutout) continue;
        const verdict: Verdict = { ok: entry.ok !== false, what: String(entry.what ?? '').trim().slice(0, 60), why: String(entry.why ?? '').trim().slice(0, 120) };
        verdicts.set(cutout.path, verdict);
        await writeFile(verdictFile(cutout.path), JSON.stringify(verdict));
      }
    } catch (error) {
      if (spent(error)) throw error;
      this.log.warn(JSON.stringify({ event: 'v2_cutout_look_failed', storeId, reason: String((error as Error)?.message ?? error).slice(0, 200) }));
    }
    return {
      cutouts: made.cutouts.filter(cutout => verdicts.get(cutout.path)?.ok !== false).map(cutout => verdicts.get(cutout.path)?.what ? { ...cutout, what: verdicts.get(cutout.path)!.what } : cutout),
      bad: made.cutouts.filter(cutout => verdicts.get(cutout.path)?.ok === false).map(cutout => `${cutout.path}: ${verdicts.get(cutout.path)!.why}`),
    };
  }

  /** Owner 2026-11-15 («do it» — like Amboras's bot, which shows in the chat the screenshots it took): YAPI says in the store's chat
   *  that it looked, shows what it saw (the first screen, then the sections and pages it will fix, at most six) and lists what it
   *  will fix. The screenshots are saved as uploads so the chat can show them like the merchant's own photos. */
  private async postLook(storeId: string, capture: V2LookCapture, problems: readonly V2LookProblem[], found: boolean) {
    if (!this.uploads) return;
    const picked = new Set([capture.shots[0]]);
    for (const problem of problems) {
      const shot = problem.page === 'product' ? capture.shots.find(entry => entry.page === 'product')
        : capture.shots.find(entry => entry.page === 'home' && entry.section === problem.section) ?? (problem.page === 'phone' ? capture.shots.find(entry => entry.page === 'phone') : undefined);
      if (shot) picked.add(shot);
    }
    if (!found) { const product = capture.shots.find(entry => entry.page === 'product'); if (product) picked.add(product); }
    const shots = [...picked].filter(Boolean).slice(0, 6);
    const urls = (await Promise.all(shots.map(shot => this.uploads!.saveBuffer(shot.jpeg, 'image/jpeg').catch(() => null)))).filter(Boolean).map(upload => upload!.url);
    const items = problems.map(problem => problem.see?.trim()).filter((see): see is string => Boolean(see)).slice(0, 8);
    if (found && !items.length && capture.productTemplateInvalid) items.push('La página de producto se ve simple, sin los capítulos de la marca.');
    const content = `Miré tu tienda en el navegador, como la verá un cliente (escritorio, celular y página de producto). ${found ? 'Voy a arreglar esto:' : 'Se ve bien.'}`;
    await this.postChat(storeId, content, { look: { items, shots: urls } });
  }

  private async postChat(storeId: string, content: string, metadata: Record<string, unknown>) {
    const thread = await this.prisma.storeAgentThread.upsert({ where: { storeId }, create: { storeId }, update: {} });
    await this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'ASSISTANT', content, metadata: metadata as never } });
  }

  /** After a run whose look found something: what was done, with the saved revision (the chat shows «Cambios guardados»). */
  private async postLookDone(storeId: string, state: V2RunState, revision: number) {
    const looks = state.looks ?? [];
    if (!looks.some(look => look.problems.length)) return;
    const clean = !looks.at(-1)!.problems.length;
    await this.postChat(storeId, clean ? 'Listo: arreglé lo que vi y lo volví a mirar; ahora se ve bien. Los cambios están guardados.'
      : 'Arreglé lo que vi y guardé los cambios. Si algo todavía no te convence, dímelo y lo cambio.', { sourceRevision: revision })
      .catch(error => this.log.warn(JSON.stringify({ event: 'v2_look_post_failed', storeId, reason: String((error as Error)?.message ?? error).slice(0, 200) })));
  }

  /** One strict-JSON call through the configured provider (the ChatGPT-plan bridge in dev), metered like every YAPI call. */
  private async call<T = unknown>(storeId: string, purpose: string, model: string, instructions: string, content: Content[], schema: object, name: string, maxOutput: number, state: V2RunState, effort: 'low' | 'medium' | 'high' = 'high'): Promise<T | null> {
    // Owner 2026-11-17: in the creative setting every prompt has the average-store rules and the craft bans swapped (creativeText).
    if (state.creative) { instructions = creativeText(instructions); content = content.map(part => part.type === 'input_text' ? { ...part, text: creativeText(part.text) } : part); }
    if (isClaude(model)) return this.callClaude<T>(storeId, purpose, model, instructions, content, schema, maxOutput, state, effort);
    const provider = sourceProvider(this.config, model);
    const started = Date.now(); let body: any = null; let status = 'FAILED';
    try {
      const response = await fetch(provider.endpoint, {
        method: 'POST', headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20 * 60_000),
        body: JSON.stringify({ model, store: false, instructions, input: [{ role: 'user', content }],
          text: { format: { type: 'json_schema', name, strict: true, schema } }, reasoning: { effort }, max_output_tokens: maxOutput }),
      });
      body = await response.json().catch(() => null);
      checkSourceProviderQuota(response.status, body, provider.name);
      state.usd += (sourceUsage(model as never, body?.usage)?.providerMicroUsd ?? 0) / 1e6;
      if (!response.ok) throw new Error(`${purpose}: ${response.status} ${JSON.stringify(body?.error ?? body).slice(0, 300)}`);
      status = 'COMPLETED';
      return sourceResponseJson(body) as T;
    } finally { await this.metering?.record(storeId, purpose, model, body, Date.now() - started, status); }
  }

  /** Owner 2026-11-16 («100 usd in claude api tokens… one store… minimize the costs»): the same call on a Claude model, paid from
   *  the Anthropic key even while the rest of YAPI runs on the ChatGPT plan. The run stops — keeping its best built version — once
   *  it has spent its cap (start's maxUsd, default $10). */
  private async callClaude<T>(storeId: string, purpose: string, model: string, instructions: string, content: Content[], schema: object, maxOutput: number, state: V2RunState, effort: 'low' | 'medium' | 'high'): Promise<T | null> {
    const apiKey = process.env.YAPI_CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('Los modelos Claude no están configurados (YAPI_CLAUDE_API_KEY).');
    const cap = state.maxUsd ?? 10;
    if (state.usd >= cap) throw new Error(`límite de uso: este diseño ya gastó $${state.usd.toFixed(2)} de $${cap} en Claude.`);
    const started = Date.now(); let body: any = null; let status = 'FAILED';
    try {
      const result = await claudeJson({ apiKey, model, instructions, content: content as ClaudePart[], schema, maxOutput, effort, signal: AbortSignal.timeout(20 * 60_000) });
      body = { usage: result.usage, stop_reason: result.stopReason, error: result.error };
      state.usd += (sourceUsage(model as never, result.usage)?.providerMicroUsd ?? 0) / 1e6;
      if (/credit balance|billing/i.test(result.error ?? '')) throw new Error(`límite de uso de Claude: ${result.error}`);
      if (result.error) throw new Error(`${purpose}: ${result.status} ${result.error.slice(0, 300)}`);
      if (result.json === null) throw new Error(`${purpose}: Claude terminó sin una respuesta completa (${result.stopReason}).`);
      status = 'COMPLETED';
      return result.json as T;
    } catch (error) {
      // Live 2026-11-17 (Bake Lab g9o8ysuz: the writer failed four times with no reason kept): the reason goes to the trace file.
      const trace = process.env.YAPI_TRACE_FILE;
      if (trace) void appendFile(trace, JSON.stringify({ at: new Date().toISOString(), event: 'v2_claude_failed', storeId, purpose, model, ms: Date.now() - started, stop: body?.stop_reason ?? null, error: String((error as Error)?.message ?? error).slice(0, 400) }) + '\n').catch(() => undefined);
      throw error;
    } finally { await this.metering?.record(storeId, purpose, model, body, Date.now() - started, status); }
  }

  /** The reference stores' first screen and one screen further down, desktop width — a normal browser, outside the build sandbox. */
  /** A remix's login look and not-found page, from screenshots of the site's own (owner 2026-11-18, Graza). The login form stays the
   *  platform's: only its layout (split with one of the store's photos, card, minimal or panel) and guarded CSS on its parts. The
   *  not-found page is a platform page in the store's Shell with a way home. Null when the site's pages could not be seen. */
  private async remixExtras(storeId: string, model: string, state: V2RunState, context: V2Context, direction: V2Direction): Promise<{ theme?: ReturnType<typeof resolveAccountTheme>['theme']; notFound?: string; css: string } | null> {
    const origin = new URL(state.remix!).origin;
    const [login, missing] = await Promise.all([this.captureReferences([`${origin}/account/login`], [0]), this.captureReferences([`${origin}/pagosya-pagina-que-no-existe`], [0])]);
    if (!login.length && !missing.length) return null;
    const photos = context.photos.filter(photo => !photo.product).map(photo => `${photo.path} (${photo.shape}${photo.words ? ', con letras' : ''})`);
    const raw = await this.call<{ layout: string; photo: string; css: string; notFound: string; notFoundCss: string }>(storeId, 'v2-remix-extras', model, REMIX_EXTRAS_PROMPT, [
      { type: 'input_text', text: `TIENDA: ${context.storeName}\nPALETA Y LETRA DE SU DISEÑO: ${JSON.stringify({ palette: direction.palette, display: direction.display, text: direction.text })}\nFOTOS DE LA TIENDA (para photo y la página 404; usa la ruta tal cual): ${photos.join(' · ') || 'ninguna'}${state.ownSite ? '\nEs la tienda anterior del propio comerciante: su arte y sus frases son suyos.' : '\nOtro sitio: copia su forma, nunca sus textos ni su logo.'}` },
      ...(login.length ? [{ type: 'input_text', text: 'SU PÁGINA DE INGRESO:' } as Content, ...login.map((image_url): Content => ({ type: 'input_image', image_url, detail: 'high' }))] : []),
      ...(missing.length ? [{ type: 'input_text', text: 'SU PÁGINA 404 (página que no existe):' } as Content, ...missing.map((image_url): Content => ({ type: 'input_image', image_url, detail: 'high' }))] : []),
    ], REMIX_EXTRAS_SCHEMA, 'v2_remix_extras', 12_000, state, 'medium');
    if (!raw) return null;
    const theme = resolveAccountTheme({ layout: raw.layout, ...(raw.photo ? { photo: raw.photo } : {}), css: raw.css }, context.photos.map(photo => photo.path)).theme;
    const page = String(raw.notFound ?? '').trim();
    // A platform page in the store's Shell with a link home, nothing more: anything else is left out rather than risked.
    const notFound = /^import Shell from '\.\.\/Shell';/m.test(page) && /href="index\.html"/.test(page) && !/dangerouslySetInnerHTML|<script|import\(|fetch\(|eval\(/.test(page) && page.length < 12_000
      ? `// @pagosya-page\n${page.replace(/^\/\/ @pagosya-page\n?/, '')}\n` : undefined;
    const css = notFound ? String(raw.notFoundCss ?? '').replace(/<\/?style[^>]*>|@import[^;]*;/gi, '').slice(0, 8_000) : '';
    return { theme, ...(notFound ? { notFound } : {}), css };
  }

  private async captureReferences(urls: string[], ys: readonly number[] = [0, 1100]): Promise<string[]> {
    if (!urls.length) return [];
    const browser = await chromium.launch({ headless: true });
    const out: string[] = [];
    try {
      for (const url of urls) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => page.waitForTimeout(3000));
          for (const y of ys) {
            await page.evaluate(top => window.scrollTo(0, top), y); await page.waitForTimeout(900);
            out.push(`data:image/jpeg;base64,${(await page.screenshot({ type: 'jpeg', quality: 70 })).toString('base64')}`);
          }
        } catch (error) { this.log.warn(JSON.stringify({ event: 'v2_reference_failed', url, reason: String((error as Error)?.message ?? error).slice(0, 200) })); }
        await page.close();
      }
    } finally { await browser.close(); }
    return out;
  }

  /** One reference store from the library on disk (scripts/brand-bench/v2-references.cjs): its name and what it teaches, its first
   *  screen at full detail; the lead reference also shows the next screen, its product page and the phone, at low detail. Missing
   *  files are skipped. */
  private async referenceShots(ref: V2Reference, lead: boolean): Promise<Content[]> {
    const dir = join(referencesDir(), ref.host);
    const out: Content[] = [{ type: 'input_text', text: `${ref.name} (${ref.host}) — enseña ${ref.teaches}:` }];
    const views = lead ? [['home-d-1', 'high'], ['home-d-2', 'low'], ['product-d-1', 'low'], ['home-p-1', 'low']] as const : [['home-d-1', 'high']] as const;
    for (const [view, detail] of views) {
      const bytes = await readFile(join(dir, `${view}.jpg`)).catch(() => null);
      if (bytes) out.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${bytes.toString('base64')}`, detail });
    }
    return out.length > 1 ? out : [];
  }

  /** A reference's recipe card, when the study route has written it. */
  private async card(host: string): Promise<V2Card | null> {
    return readFile(join(referencesDir(), 'cards', `${host}.json`), 'utf8').then(text => JSON.parse(text) as V2Card).catch(() => null);
  }

  // The study library (owner 2026-11-14 «make it learn from all types of ecommerce sites»): one recipe card per captured reference,
  // written once from its pages and measurements. Dev only, like the prototype; metered on the store that asked.
  private studyState?: V2StudyState;

  async startStudy(merchantId: string, storeId: string, input: { hosts?: string[]; force?: boolean }) {
    this.enabled();
    await this.projects.version(merchantId, storeId, await this.latest(storeId));
    if (this.studyState?.status === 'RUNNING') throw new ConflictException('Ya hay un estudio de referencias en curso.');
    const state: V2StudyState = { status: 'RUNNING', startedAt: new Date().toISOString(), done: [], skipped: [], failed: [], usd: 0 };
    this.studyState = state;
    const hosts = V2_REFERENCES.map(ref => ref.host).filter(host => !input.hosts?.length || input.hosts.includes(host));
    void (async () => {
      let next = 0;
      await Promise.all([0, 1].map(async () => {
        while (next < hosts.length) {
          const host = hosts[next++];
          try { (await this.studyOne(storeId, host, Boolean(input.force), state)) ? state.done.push(host) : state.skipped.push(host); } catch (error) {
            state.failed.push({ host, reason: String((error as Error)?.message ?? error).slice(0, 300) });
            if (spent(error)) next = hosts.length;
          }
        }
      }));
      state.status = 'DONE';
      this.log.log(JSON.stringify({ event: 'v2_study', done: state.done.length, skipped: state.skipped.length, failed: state.failed.length, usd: state.usd }));
    })();
    return state;
  }

  async studyStatus(merchantId: string, storeId: string) {
    this.enabled();
    await this.projects.version(merchantId, storeId, await this.latest(storeId));
    return this.studyState ?? null;
  }

  /** One store's card from its captured pages (first screens at full detail, the rest low) and its measurements. False when it has
   *  no capture (blocked, unreachable) or already has a card. */
  private async studyOne(storeId: string, host: string, force: boolean, state: { usd: number }): Promise<boolean> {
    const dir = referencesDir();
    const out = join(dir, 'cards', `${host}.json`);
    if (!force && await readFile(out).then(() => true, () => false)) return false;
    const index = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8').catch(() => '{}'))[host] as { shots?: Record<string, string[]> } | undefined;
    if (!index?.shots?.home?.length) return false;
    const ref = V2_REFERENCES.find(entry => entry.host === host)!;
    const sharp = new Set(['home-d-1.jpg', 'catalog-d-1.jpg', 'product-d-1.jpg', 'home-p-1.jpg']);
    const content: Content[] = [{ type: 'input_text', text: `TIENDA: ${ref.name} (${host})` }];
    for (const [part, label] of [['home', 'PORTADA, escritorio, de arriba abajo'], ['homePhone', 'PORTADA, teléfono'], ['catalog', 'CATÁLOGO (escritorio, luego teléfono)'], ['product', 'PÁGINA DE PRODUCTO (escritorio, luego teléfono)'], ['cart', 'CARRITO']] as const) {
      const files = index.shots[part] ?? [];
      if (!files.length) { content.push({ type: 'input_text', text: `${label}: (sin captura)` }); continue; }
      content.push({ type: 'input_text', text: `${label}:` });
      for (const file of files) {
        const bytes = await readFile(join(dir, host, file)).catch(() => null);
        if (bytes) content.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${bytes.toString('base64')}`, detail: sharp.has(file) ? 'high' : 'low' });
      }
    }
    const facts = await readFile(join(dir, host, 'facts.json'), 'utf8').catch(() => '');
    if (facts) content.push({ type: 'input_text', text: `MEDIDAS DEL NAVEGADOR (por página; d = escritorio 1440, p = teléfono 390):\n${facts.slice(0, 30_000)}` });
    const model = this.config.get<string>('app.yapiV2Model') || 'gpt-5.6-sol';
    const run = { usd: 0 } as V2RunState;
    const card = await this.call<Omit<V2Card, 'host' | 'name' | 'at'>>(storeId, 'v2-study', model, v2CardPrompt(), content, v2CardSchema(), 'v2_card', 8_000, run, 'medium');
    state.usd += run.usd;
    if (!card) throw new Error('la ficha no llegó');
    await mkdir(join(dir, 'cards'), { recursive: true });
    await writeFile(out, JSON.stringify({ host, name: ref.name, at: new Date().toISOString(), ...card }, null, 2) + '\n');
    return true;
  }

  private async signature(snapshot: SourceProjectSnapshot): Promise<SectionShape[]> {
    return withVisualSandbox(snapshot, sourceVisualState(snapshot, 'index.html', undefined, true).query, undefined, false, async context => {
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 30_000 });
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.waitForTimeout(800);
      return page.evaluate(layoutSignature);
    }, 'reduce');
  }

  /** The sandbox's snapshot, saved as is (preparedSourceArtifact: the checked bytes are the saved bytes), under its own generation run. */
  private async save(merchantId: string, storeId: string, revision: number, input: Parameters<SourceProjectsService['save']>[2], snapshot: SourceProjectSnapshot, model: string, durationMs: number, attempts: V2Attempt[]) {
    // The design is built from the last template revision, but it is saved on top of the store's current one (live 2026-11-14 15:07:
    // NOA and Oh Belly built, then «El proyecto cambió en otra sesión» because the save named the older revision).
    const head = await this.latest(storeId);
    const current = { ...input, revision: head } as typeof input;
    const run = await this.prisma.storeSourceGeneration.create({ data: { storeId, activeStoreId: storeId, baseRevision: revision, requestedModel: model, model, maxCredits: 0 } });
    try {
      return await this.projects.save(merchantId, storeId, current, { id: run.id, prepared: preparedSourceArtifact(current, snapshot),
        data: { status: 'COMPLETED', activeStoreId: null, revision: head + 1, durationMs, completedAt: new Date(), attempts: attempts as never } });
    } catch (error) {
      await this.prisma.storeSourceGeneration.updateMany({ where: { id: run.id, status: 'RUNNING' }, data: { status: 'FAILED', activeStoreId: null, completedAt: new Date() } });
      throw error;
    }
  }
}
