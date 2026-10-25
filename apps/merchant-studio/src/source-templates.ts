import { escapeHtml as escape } from './studio-ui';
import './source-templates.css';

/** A Plantilla as the API lists it. The gallery and its dashboard tab were removed (owner 2026-10-25); YAPI can still
 *  suggest three in a chat message. */
export type TemplateSummary = { id: string; name: string; category: string; description: string; tags: string[]; order: number };

export type TemplateChoice = { id: string; name: string; reason: string };

/** YAPI's three suggestions (spec 2026-09-26): the card itself is the choice, no separate button. */
export function renderTemplateChoices(choices: TemplateChoice[], previewBase: string, off: boolean): string {
  return `<div class="tpl-choices">${choices.map(choice => `<button type="button" class="tpl-choice" data-template-choice="${escape(choice.id)}" data-template-name="${escape(choice.name)}" ${off ? 'disabled' : ''}>
    <img src="${escape(previewBase)}plantillas/${escape(choice.id)}.webp" alt="" loading="lazy">
    <strong>${escape(choice.name)}</strong><span>${escape(choice.reason)}</span>
  </button>`).join('')}</div>`;
}
