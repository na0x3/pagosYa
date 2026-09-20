import './source-inspiration.css';

/** Decorative waiting canvas, never an invented preview of the merchant's site. */
export function renderInspiration(options: { busy: boolean; disabled: boolean; paused: boolean; commerce?: boolean }): string {
  const images = ['alpine-ridge.jpg', 'alpine-lake.jpg', 'forest-lake.jpg', 'alpine-ridge.jpg', 'alpine-lake.jpg'];
  return `<section class="source-empty-preview source-inspiration ${options.paused ? 'is-paused' : ''}" aria-label="Tu sitio a medida">
    <div class="inspiration-stage" aria-hidden="true">
      ${Array.from({ length: 5 }, (_, index) => `<div class="inspiration-card inspiration-card--${index}" style="--card-index:${index}">
        <img src="${import.meta.env.BASE_URL}inspiration/${images[index]}" alt="" width="736" height="1104" decoding="async" draggable="false">
        ${index % 2 === 0 ? '<div class="inspiration-site"><span>HORIZONTE<span>Explora ↗</span></span><strong>Todo empieza<br>con una idea.</strong><small>Encuentra tu propio camino.</small></div>' : ''}
      </div>`).join('')}
    </div>
    <div class="inspiration-topline"><span>Un espacio para imaginar</span><button type="button" data-inspiration-pause aria-pressed="${options.paused}" aria-label="${options.paused ? 'Reanudar animación de inspiración' : 'Pausar animación de inspiración'}">${options.paused ? 'Reanudar' : 'Pausar'}<span aria-hidden="true">${options.paused ? '▷' : 'Ⅱ'}</span></button></div>
    <div class="source-empty-copy"><span class="inspiration-eyebrow">${options.busy ? 'YAPI está creando' : 'TU PRÓXIMA IDEA'}</span><h1>Tu negocio, tu sitio.</h1><p>${options.busy ? 'Tu diseño está tomando forma. Puedes seguir el proceso en la conversación.' : 'Cuéntale a YAPI qué quieres crear. Tu idea, tus fotos y tu marca darán forma al diseño.'}</p>${options.commerce === false ? '' : `<div class="source-empty-actions"><button type="button" class="button" data-start-photo ${options.disabled ? 'disabled' : ''}>Crear tienda desde una foto <span aria-hidden="true">↗</span></button></div>`}<small>Inspiración visual · tu sitio aparecerá aquí</small></div>
  </section>`;
}
