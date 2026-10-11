import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { ORDER_EMAIL_TEMPLATE_PATH } from '../order-emails/order-email-slots';
import { SOURCE_KIT_CSS_PATH } from './source-kit-css';
import { isSourceMotifFile } from './source-motifs';
import { STATIC_STANDARD_PAGE_PATHS } from './source-static-pages';

/** Files the platform writes at save; a model never authors them. */
const RESERVED = new Set(['config.js', 'commerce.js', 'brand.css']);
/** Platform stylesheets: authored stores restyle them from their own CSS, never by rewriting them. */
const PLATFORM_CSS = new Set(['commerce-pages.css', 'brand.css', SOURCE_KIT_CSS_PATH]);

/** A path a generated project may contain: its own html, css and js, plus the few platform slots it may fill. */
export function isAuthorableSourcePath(path: string): boolean {
  if (RESERVED.has(path)) return false;
  return /^(?:pages\/)?[a-zA-Z0-9_-]+\.(html|css|js)$/.test(path) || path === SOURCE_KIT_CSS_PATH || path === ORDER_EMAIL_TEMPLATE_PATH || isSourceMotifFile(path);
}

/**
 * The Sep-5 author returns "the whole project". Shown a redesign's config.js, JSON design files or README, it can
 * echo one back, and the whole draft used to fail as "intentó cambiar un archivo reservado". Those files are rebuilt
 * at save, so dropping them loses nothing the model may change.
 */
export function sep5AuthorableFiles<T extends { path: string }>(files: T[]): { files: T[]; dropped: string[] } {
  // A file returned twice (paths are compared without case, as the save does) keeps its last copy, the author's final word.
  const last = new Map(files.map((file, index) => [file.path.toLowerCase(), index]));
  const duplicates = files.filter((file, index) => last.get(file.path.toLowerCase()) !== index).map(file => `${file.path} (duplicate)`);
  const unique = files.filter((file, index) => last.get(file.path.toLowerCase()) === index);
  return { files: unique.filter(file => isAuthorableSourcePath(file.path)), dropped: [...duplicates, ...unique.filter(file => !isAuthorableSourcePath(file.path)).map(file => file.path)] };
}

/** What a redesign shows the author: only what it may rewrite. Standard pages are copies of index.html rebuilt at save. */
export function sep5PreviousSource(files: SourceProjectFileDto[]): SourceProjectFileDto[] {
  return files.filter(file => isAuthorableSourcePath(file.path) && !STATIC_STANDARD_PAGE_PATHS.includes(file.path) && !PLATFORM_CSS.has(file.path));
}
