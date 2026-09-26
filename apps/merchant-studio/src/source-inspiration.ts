import './source-inspiration.css';
import { renderFace } from './source-face';

/**
 * The idle canvas: what fills the preview before a merchant has a site.
 *
 * It has been, in turn, three stock landscape photographs behind a fictional
 * brand, a stack of CSS storefront cards with a small game docked in the corner,
 * a wireframe that re-composed itself, and an ink line drawing. Each one drew a
 * window holding a site nobody had built yet.
 *
 * It is now the invitation beside YAPI itself: a face that waits and blinks
 * while the merchant thinks. No photography, no invented brand, no fake browser,
 * nothing to play, and nothing to press but the invitation itself.
 */
export function renderInspiration(options: { busy: boolean; disabled: boolean; commerce?: boolean }): string {
  return `<section class="source-empty-preview source-inspiration" aria-label="Tu sitio a medida">
    <div class="inspiration-layout">
      <div class="source-empty-copy">
        <img class="inspiration-mark" src="${import.meta.env.BASE_URL}logo-mark.png" alt="pagosYa" width="42" height="42" decoding="async">
        <span class="inspiration-eyebrow">${options.busy ? 'YAPI ESTÁ CREANDO' : 'TU PRÓXIMA IDEA'}</span>
        <h1>Tu negocio, tu sitio.</h1>
        <p>${options.busy ? 'Tu diseño está tomando forma. Puedes seguir el proceso en la conversación.' : 'Cuéntale a YAPI qué quieres crear. Tu idea, tus fotos y tu marca darán forma al diseño.'}</p>
        ${options.commerce === false ? '' : `<div class="source-empty-actions"><button type="button" class="button" data-open-templates ${options.disabled ? 'disabled' : ''}>Elegir una plantilla</button><button type="button" class="button button--secondary" data-start-photo ${options.disabled ? 'disabled' : ''}>Crear tienda desde una foto <span aria-hidden="true">↗</span></button></div>`}
        <small>Tu sitio aparecerá aquí</small>
      </div>
      <div class="inspiration-stage">
        ${renderFace()}
      </div>
    </div>
  </section>`;
}
