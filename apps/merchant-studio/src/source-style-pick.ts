import { escapeHtml as escape } from './studio-ui';
import './source-style-pick.css';

export type StyleCard = { index: number; slot: number; name: string; mode: 'calm' | 'bold'; vibe: string; inspiration: string[]; fonts: { display: string; text: string; displayFamily: string; textFamily: string }; palette: string[]; html: string | null; source: 'model' | 'template' | null };
/** PICKED: the merchant's pick whose build failed; the cards stay, with that card marked, so it can be retried. */
export type StyleProposalView = { generationId: string; status: 'RUNNING' | 'AWAITING_STYLE' | 'PICKED'; recommended: number; picked?: number; cards: StyleCard[] };

const HEX = /^#[0-9a-f]{6}$/i;
const dots = (palette: string[]) => palette.filter(colour => HEX.test(colour)).map(colour => `<i style="background:${colour}"></i>`).join('');
const tag = (mode: 'calm' | 'bold') => mode === 'bold' ? '<span class="style-tag style-tag--bold">Atrevido</span>' : '<span class="style-tag style-tag--calm">Tranquilo</span>';

const API_PATH = /(^|["'(\s,=])\/(?:api\/)?v1\/(uploads|source-fonts)\//g;
/** The API writes hero uploads and fonts as API-relative paths (/v1/uploads/…, /v1/source-fonts/…); the card iframe
 * loads them from Studio's API base, the same base the rest of Studio reads uploads from. */
export function apiHeroUrls(html: string, apiBase: string): string {
  const base = apiBase.replace(/\/$/, '');
  return html.replace(API_PATH, (_match, lead: string, kind: string) => `${lead}${base}/${kind}/`);
}

/** The card's hero as an iframe document. srcdoc is an attribute, so the document is escaped once for it. */
export function heroSrcdoc(html: string): string {
  return escape(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}a{color:inherit}</style></head><body>${html}</body></html>`);
}
const DESKTOP = { width: 1280, height: 800 }, PHONE = { width: 390, height: 844 };
const frame = (card: StyleCard, size: { width: number; height: number }) => card.html
  ? `<div class="style-frame" data-frame-width="${size.width}" data-frame-height="${size.height}"><iframe sandbox="" loading="lazy" tabindex="-1" title="${escape(card.name)}" style="width:${size.width}px;height:${size.height}px" srcdoc="${heroSrcdoc(card.html)}"></iframe></div>`
  : '<div class="style-frame style-frame--empty" aria-hidden="true"></div>';

/** How far a width×height page shrinks to fit a box: whole page visible, never enlarged. */
export function frameScale(boxWidth: number, boxHeight: number, width: number, height: number): number {
  if (!(width > 0 && height > 0)) return 1;
  return Math.max(0, Math.min(1, boxWidth / width, boxHeight / height));
}

/** Scales each fixed-size card iframe to fit its box; call after inserting the picker and on resize. */
export function fitStyleFrames(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.style-frame[data-frame-width]').forEach(el => el.style.setProperty('--frame-scale', String(frameScale(el.clientWidth, el.clientHeight, Number(el.dataset.frameWidth), Number(el.dataset.frameHeight)))));
}

export function renderStylePicker(view: StyleProposalView | null, state: { open: number | null; device: 'desktop' | 'phone'; storeName: string; busy: boolean }): string {
  const cards = view?.cards ?? [];
  const running = !view || view.status === 'RUNNING';
  const open = state.open !== null ? cards.find(card => card.index === state.open && card.html) : undefined;
  if (open) {
    return `<section class="style-pick style-pick--preview" aria-label="${escape(open.name)}">
      <div class="style-preview__stage"><div class="style-preview__toggle" role="group" aria-label="Tamaño"><button type="button" data-style-device="desktop" aria-pressed="${state.device === 'desktop'}">Escritorio</button><button type="button" data-style-device="phone" aria-pressed="${state.device === 'phone'}">Celular</button></div>${frame(open, state.device === 'phone' ? PHONE : DESKTOP)}</div>
      <aside class="style-preview__side"><button type="button" class="link" data-style-close>← Ver los ${cards.length} estilos</button><h2>${escape(open.name)} ${tag(open.mode)}</h2>
        <h3>Vibe</h3><p>${escape(open.vibe)}</p>
        <h3>Inspiración</h3><ul>${open.inspiration.map(line => `<li>${escape(line)}</li>`).join('')}</ul>
        <h3>Tipografía</h3><p class="style-type"><strong>Aa</strong> ${escape(open.fonts.displayFamily)}<br><span>${escape(state.storeName)}</span> ${escape(open.fonts.textFamily)}</p>
        <button type="button" class="button button--primary" data-style-use="${Number(open.index)}" ${state.busy ? 'disabled' : ''}>Usar este estilo</button></aside></section>`;
  }
  const placeholders = running ? Math.max(0, 4 - cards.length) : 0;
  const picked = view?.status === 'PICKED' ? cards.find(card => card.index === view.picked) : undefined;
  const footer = running ? '' : picked
    ? `<footer><button type="button" class="button button--primary" data-style-retry="${Number(picked.index)}" ${state.busy ? 'disabled' : ''}>Reintentar con «${escape(picked.name)}»</button></footer>`
    : `<footer><button type="button" class="button" data-style-auto ${state.busy ? 'disabled' : ''}>Elige tú</button></footer>`;
  return `<section class="style-pick" aria-label="Elige tu estilo" aria-busy="${running}">
    <header><h2>${running ? 'Preparando tus estilos…' : picked ? 'Tu estilo quedó elegido' : 'Elige tu estilo'}</h2><p>${picked ? 'La tienda no se terminó de construir. Reintenta con tu estilo o elige otro.' : `${escape(state.storeName)}: dos tranquilos y dos atrevidos.`}</p></header>
    <div class="style-grid">${cards.map(card => `<button type="button" class="style-card${card === picked ? ' style-card--picked' : ''}" data-style-card="${Number(card.index)}" ${card === picked ? 'aria-current="true" ' : ''}${card.html ? '' : 'disabled'}>${frame(card, DESKTOP)}<span class="style-card__meta"><strong>${escape(card.name)}</strong>${tag(card.mode)}${card === picked ? '<span class="style-tag style-tag--picked">Elegido</span>' : ''}<small>${escape(card.fonts.displayFamily)} · ${escape(card.fonts.textFamily)}</small><span class="style-dots">${dots(card.palette)}</span></span></button>`).join('')}${'<div class="style-card style-card--empty" data-style-placeholder aria-hidden="true"></div>'.repeat(placeholders)}</div>
    ${footer}</section>`;
}
