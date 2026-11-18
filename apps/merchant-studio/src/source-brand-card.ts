/** «Mejorar mi marca» identity card (spec 2026-11-18 §3.4): swatches, fonts, reference brands, under YAPI's identity message. */
export type BrandCardView = { swatches: Array<{ role: string; hex: string }>; fonts: Array<{ role: string; family: string }>; references: Array<{ name: string; why: string }>; searched: boolean };
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const HEX = /^#[0-9A-Fa-f]{6}$/;
const FAMILY = /^[A-Za-z0-9 ]{1,60}$/;
const list = (value: unknown) => (Array.isArray(value) ? value : []) as Array<Record<string, unknown>>;

export function brandCardOf(message: { id: string; metadata?: Record<string, unknown> | null }): BrandCardView | null {
  const card = message.metadata?.brandCard as Record<string, unknown> | undefined;
  if (!card) return null;
  const swatches = list(card.swatches).map(s => ({ role: String(s.role ?? ''), hex: String(s.hex ?? '') })).filter(s => HEX.test(s.hex)).slice(0, 5);
  const fonts = list(card.fonts).map(f => ({ role: String(f.role ?? ''), family: String(f.family ?? '') })).filter(f => FAMILY.test(f.family)).slice(0, 3);
  const references = list(card.references).map(r => ({ name: String(r.name ?? ''), why: String(r.why ?? '') })).filter(r => r.name).slice(0, 3);
  return swatches.length ? { swatches, fonts, references, searched: card.searched !== false } : null;
}

export function renderBrandCard(card: BrandCardView): string {
  return '<div class="brand-card">'
    + `<ul class="brand-card__swatches">${card.swatches.map(s => `<li><span class="brand-card__swatch" style="background:${s.hex}"></span><small>${esc(s.role)}</small><code>${s.hex}</code></li>`).join('')}</ul>`
    + `<ul class="brand-card__fonts">${card.fonts.map(f => `<li><small>${esc(f.role)}</small><span style="font-family:'${f.family}'">${esc(f.family)}</span></li>`).join('')}</ul>`
    + (card.references.length ? `<ul class="brand-card__refs">${card.references.map(r => `<li title="${esc(r.why)}">${esc(r.name)}</li>`).join('')}</ul>` : '')
    + (card.searched ? '' : '<p class="brand-card__note">(sin búsqueda en vivo)</p>')
    + '</div>';
}
