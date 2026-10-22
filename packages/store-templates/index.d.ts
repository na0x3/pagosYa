export type TemplateCategory = 'comida' | 'moda' | 'belleza' | 'hogar' | 'arte' | 'tecnologia' | 'mascotas' | 'ninos' | 'deporte' | 'servicios' | 'libros' | 'producto-unico' | 'motor' | 'construccion' | 'general';
export type PhotoRole = 'hero' | 'product' | 'lifestyle' | 'detail';
export interface TemplatePhotoSlot { readonly slot: string; readonly role: PhotoRole; readonly demo?: string }
export interface MasterValue { readonly title: string; readonly text: string }
export interface MasterCopy { readonly announcement: string; readonly eyebrow: string; readonly headline: string; readonly subcopy: string; readonly primaryCta: string; readonly secondaryCta: string; readonly productsTitle: string; readonly storyTitle: string; readonly storyBody: string; readonly values: readonly MasterValue[]; readonly closingLine: string; readonly closingCta: string; readonly tagline: string }
export interface MasterPalette { readonly id: string; readonly name: string; readonly paper: string; readonly ink: string; readonly muted: string; readonly accent: string; readonly deep: string }
export interface MasterFontPair { readonly id: string; readonly name: string; readonly heading: string; readonly body: string }
/** Spec 2026-10-19 master template: default copy, eight palettes and eight font pairs (kit font catalogue ids). */
export interface MasterSettings { readonly copy: MasterCopy; readonly palettes: readonly MasterPalette[]; readonly fonts: readonly MasterFontPair[]; readonly variants?: Readonly<Record<string, readonly string[]>>; readonly sections?: readonly string[] }
export interface TemplateManifest {
  readonly id: string; readonly name: string; readonly category: TemplateCategory; readonly description: string;
  readonly tags: readonly string[]; readonly sitePurpose: 'shop'; readonly order: number; readonly photos: readonly TemplatePhotoSlot[];
  /** Kit surfaces the design depends on, pinned over the store's seeded DNA (e.g. { button: 'block' }). */
  readonly dna?: Readonly<Record<string, string>>;
  /** Left out of the gallery and YAPI picks; still resolvable by id. */
  readonly hidden?: boolean;
  /** Present on the master template only: what a new store is filled from. */
  readonly master?: MasterSettings;
  /** Spec 2026-10-20 Plantillas fill: every visible text of a converted template, as flat slots in store-data `copy`. */
  readonly copy?: readonly TemplateCopySlot[];
  /** Shown in the gallery and «Elegir una plantilla»; only converted templates (with `copy`) and presets may be curated. */
  readonly curated?: boolean;
  /** Plantillas presets (2026-10-22): the master template this one is a look of; it has no source of its own. */
  readonly extends?: string;
  readonly preset?: TemplatePreset;
  /** Set by the API on a preset resolved to its master: whose demo photos the assembled store carries. */
  readonly photoSource?: string;
}
/** A preset of a master template: palette and font pair ids, one variant id per part (feature: a comma list), optional
 *  colours, business sections and starting words. */
export interface TemplatePreset {
  readonly palette: string; readonly fonts: string; readonly colors?: Readonly<Record<string, string>>;
  readonly variants: Readonly<Record<string, string>>;
  readonly kind?: 'fashion' | 'other';
  readonly sections?: ReadonlyArray<{ readonly id: string; readonly title: string; readonly items: ReadonlyArray<{ readonly title: string; readonly text: string }> }>;
  readonly copy?: Readonly<Partial<Record<Exclude<keyof MasterCopy, 'values'>, string>>> & { readonly values?: readonly MasterValue[] };
  readonly featureCopy?: Readonly<Record<string, unknown>>;
}
export type TemplateCopyRole = 'headline' | 'title' | 'lead' | 'body' | 'cta' | 'label' | 'item' | 'question' | 'answer' | 'quote' | 'name' | 'alt';
export interface TemplateCopySlot { readonly key: string; readonly role: TemplateCopyRole; readonly default: string; readonly max: number }
export declare const TEMPLATE_CATEGORIES: readonly TemplateCategory[];
export declare const PHOTO_ROLES: readonly PhotoRole[];
export declare const DEMO_MAX_BYTES: number;
export declare const templatesDir: string;
export declare function loadTemplates(root?: string): Array<{ dir: string; manifest: TemplateManifest }>;
export declare function listTemplates(): TemplateManifest[];
export declare function templateManifest(id: string): TemplateManifest | undefined;
export declare function gallerySelection(manifests: readonly TemplateManifest[]): TemplateManifest[];
export declare function galleryTemplates(): TemplateManifest[];
export declare function templateSourceFiles(id: string): Array<{ path: string; content: string }>;
export declare function templateDemoPhoto(id: string, slot: string): { ext: string; bytes: Buffer } | undefined;
export declare function readTemplateSource(dir: string): Array<{ path: string; content: string }>;
