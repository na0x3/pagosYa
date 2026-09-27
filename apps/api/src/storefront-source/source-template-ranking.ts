/** YAPI from Plantillas (spec 2026-09-26-yapi-from-templates-design.md §3): the three templates offered to a new shop.
 * The conversation model's suggestions come first; the rest is filled by word overlap with the conversation summary. */
import type { TemplateManifest } from '@pagosya/store-templates';

export type TemplateChoice = { id: string; name: string; reason: string };
export type RankedTemplate = Pick<TemplateManifest, 'id' | 'name' | 'category' | 'description' | 'tags' | 'order'>;

const words = (text: string) => new Set(text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter(word => word.length > 2));

export function rankTemplates(summary: string, templates: readonly RankedTemplate[], suggested: ReadonlyArray<{ id: string; reason: string }> = []): TemplateChoice[] {
  const byId = new Map(templates.map(template => [template.id, template]));
  const choices: TemplateChoice[] = [];
  for (const { id, reason } of suggested) {
    const template = byId.get(id);
    if (!template || choices.length === 3 || choices.some(choice => choice.id === id)) continue;
    choices.push({ id, name: template.name, reason: reason.trim().slice(0, 200) || template.description });
  }
  const said = words(summary);
  const score = (template: RankedTemplate) => [...words([template.name, template.category, ...template.tags, template.description].join(' '))]
    .filter(word => said.has(word)).length;
  const rest = templates.filter(template => !choices.some(choice => choice.id === template.id))
    .map(template => ({ template, score: score(template) }))
    .sort((a, b) => b.score - a.score || a.template.order - b.template.order);
  for (const { template } of rest) {
    if (choices.length === 3) break;
    choices.push({ id: template.id, name: template.name, reason: template.description });
  }
  return choices;
}
