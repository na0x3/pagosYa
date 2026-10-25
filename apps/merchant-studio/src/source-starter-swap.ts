/** «Probar otro estilo» (spec 2026-10-24 §2): under a new store's first build, the two next-best starters as cards with their
 *  gallery picture. Tapping one rebuilds the store from it; the old version stays in the history. */
export type StarterAlternative = { id: string; name: string; description: string; preview: string };
type ChatMessageLike = { id: string; role: string; metadata?: Record<string, unknown> | null };

const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const BUILD_LABEL = /^(Estilo|Plantilla):/;

export function renderStarterSwap(alternatives: StarterAlternative[], base: string, busy: boolean): string {
  if (!alternatives.length) return '';
  const off = busy ? ' disabled' : '';
  return `<section class="source-starter-swap" aria-label="Probar otro estilo"><h3>Probar otro estilo</h3><div class="style-grid">${alternatives.map(alternative =>
    `<button type="button" class="style-card" data-starter-swap="${esc(alternative.id)}"${off}><img src="${esc(base + alternative.preview)}" alt="" loading="lazy"><span class="style-card__meta"><strong>${esc(alternative.name)}</strong><small>${esc(alternative.description)}</small></span></button>`).join('')}</div></section>`;
}

export function bindStarterSwap(root: HTMLElement, deps: { post: (starterId: string) => Promise<unknown>; onDone: () => void; onError: (message: string) => void }): void {
  const cards = () => [...root.querySelectorAll<HTMLButtonElement>('[data-starter-swap]')];
  cards().forEach(card => card.addEventListener('click', () => {
    const id = card.dataset.starterSwap;
    if (!id) return;
    cards().forEach(button => { button.disabled = true; });
    card.setAttribute('aria-busy', 'true');
    deps.post(id).then(() => deps.onDone(), (error: unknown) => {
      cards().forEach(button => { button.disabled = false; });
      card.removeAttribute('aria-busy');
      deps.onError(error instanceof Error ? error.message : 'No pude cambiar el estilo.');
    });
  }));
}

/** The cards sit under the latest reply that saved a style or a template, until the merchant writes again. */
export function showsStarterSwap(messages: ChatMessageLike[], messageId: string): boolean {
  const builds = messages.filter(message => message.role === 'ASSISTANT' && typeof message.metadata?.label === 'string' && BUILD_LABEL.test(message.metadata.label as string));
  const latest = builds[builds.length - 1];
  if (!latest || latest.id !== messageId) return false;
  return !messages.slice(messages.indexOf(latest) + 1).some(message => message.role === 'USER');
}
