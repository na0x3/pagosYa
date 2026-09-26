export type TemplateCategory = 'comida' | 'moda' | 'belleza' | 'hogar' | 'arte' | 'tecnologia' | 'mascotas' | 'ninos' | 'deporte' | 'servicios' | 'producto-unico';
export type PhotoRole = 'hero' | 'product' | 'lifestyle' | 'detail';
export interface TemplatePhotoSlot { readonly slot: string; readonly role: PhotoRole; readonly demo?: string }
export interface TemplateManifest {
  readonly id: string; readonly name: string; readonly category: TemplateCategory; readonly description: string;
  readonly tags: readonly string[]; readonly sitePurpose: 'shop'; readonly order: number; readonly photos: readonly TemplatePhotoSlot[];
  /** Kit surfaces the design depends on, pinned over the store's seeded DNA (e.g. { button: 'block' }). */
  readonly dna?: Readonly<Record<string, string>>;
}
export declare const TEMPLATE_CATEGORIES: readonly TemplateCategory[];
export declare const PHOTO_ROLES: readonly PhotoRole[];
export declare const DEMO_MAX_BYTES: number;
export declare const templatesDir: string;
export declare function loadTemplates(root?: string): Array<{ dir: string; manifest: TemplateManifest }>;
export declare function listTemplates(): TemplateManifest[];
export declare function templateManifest(id: string): TemplateManifest | undefined;
export declare function templateSourceFiles(id: string): Array<{ path: string; content: string }>;
export declare function templateDemoPhoto(id: string, slot: string): { ext: string; bytes: Buffer } | undefined;
export declare function readTemplateSource(dir: string): Array<{ path: string; content: string }>;
