import { escapeHtml as escape } from './studio-ui';

export type DirectionChoice = { id: string; name: string; description: string; palette: { background: string; surface: string; ink: string; accent: string }; fonts: { display: string; text: string } };

const HEX = /^#[0-9a-f]{6}$/i;
const color = (value: unknown, fallback: string) => typeof value === 'string' && HEX.test(value) ? value : fallback;
const fontName = (id: string) => id.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

/** YAPI's one question before a from-scratch build (sub-project 2): each card is a direction with a mini hero in its palette. */
export function renderDirectionChoices(choices: DirectionChoice[], off: boolean): string {
  return `<div class="dir-choices">${choices.map(choice => {
    const p = { background: color(choice.palette?.background, '#f5f5f5'), surface: color(choice.palette?.surface, '#e5e5e5'), ink: color(choice.palette?.ink, '#111111'), accent: color(choice.palette?.accent, '#333333') };
    const display = fontName(String(choice.fonts?.display || ''));
    const text = fontName(String(choice.fonts?.text || ''));
    return `<button type="button" class="dir-choice" data-direction-choice="${escape(choice.id)}" data-direction-name="${escape(choice.name)}" ${off ? 'disabled' : ''}>
    <span class="dir-choice__hero" aria-hidden="true" style="background:${p.background};color:${p.ink}">
      <span class="dir-choice__headline">${escape(choice.name)}</span>
      <span class="dir-choice__band" style="background:${p.surface}"></span>
      <span class="dir-choice__cta" style="background:${p.accent};color:${p.background}">Comprar</span>
      <span class="dir-choice__swatches">${[p.background, p.surface, p.ink, p.accent].map(swatch => `<i style="background:${swatch}"></i>`).join('')}</span>
    </span>
    <strong>${escape(choice.name)}</strong><span>${escape(choice.description)}</span><small>${escape(display)} · ${escape(text)}</small>
  </button>`;
  }).join('')}</div>`;
}
