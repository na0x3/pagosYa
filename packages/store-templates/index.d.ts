export type TemplateCategory = 'comida' | 'moda' | 'belleza' | 'hogar' | 'arte' | 'tecnologia' | 'mascotas' | 'ninos' | 'deporte' | 'servicios' | 'libros' | 'producto-unico' | 'motor' | 'construccion' | 'general';
export type PhotoRole = 'hero' | 'product' | 'lifestyle' | 'detail';
export interface TemplatePhotoSlot { readonly slot: string; readonly role: PhotoRole; readonly demo?: string }
export interface MasterValue { readonly title: string; readonly text: string }
export interface MasterCopy { readonly announcement: string; readonly eyebrow: string; readonly headline: string; readonly subcopy: string; readonly primaryCta: string; readonly secondaryCta: string; readonly productsTitle: string; readonly storyTitle: string; readonly storyBody: string; readonly values: readonly MasterValue[]; readonly closingLine: string; readonly closingCta: string; readonly tagline: string }
export interface MasterPalette { readonly id: string; readonly name: string; readonly paper: string; readonly ink: string; readonly muted: string; readonly accent: string; readonly deep: string }
export interface MasterFontPair { readonly id: string; readonly name: string; readonly heading: string; readonly body: string }
/** Spec 2026-10-19 master template: default copy, eight palettes and eight font pairs (kit font catalogue ids). */
export interface MasterSettings { readonly copy: MasterCopy; readonly palettes: readonly MasterPalette[]; readonly fonts: readonly MasterFontPair[] }
export interface TemplateManifest {
  readonly id: string; readonly name: string; readonly category: TemplateCategory; readonly description: string;
  readonly tags: readonly string[]; readonly sitePurpose: 'shop'; readonly order: number; readonly photos: readonly TemplatePhotoSlot[];
  /** Kit surfaces the design depends on, pinned over the store's seeded DNA (e.g. { button: 'block' }). */
  readonly dna?: Readonly<Record<string, string>>;
  /** Left out of the gallery and YAPI picks; still resolvable by id. */
  readonly hidden?: boolean;
  /** Present on the master template only: what a new store is filled from. */
  readonly master?: MasterSettings;
}
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
