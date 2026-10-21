/** Spec 2026-10-20 §6: which direct-edit field holds the text a merchant double-clicked in the preview. */
import type { VisualField } from './source-visual-fields';

const words = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The first text field that shows exactly these words (whitespace aside). Two fields with the same words: the first
 *  wins and only it changes, which is what the merchant sees change on the page. */
export function matchInlineField(fields: readonly VisualField[], before: string): VisualField | undefined {
  const wanted = words(before);
  return wanted ? fields.find(field => field.kind === 'text' && words(field.previewValue ?? field.value) === wanted) : undefined;
}
