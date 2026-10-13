/**
 * A showcase store's main action (spec docs/superpowers/specs/2026-10-13-showcase-stores-and-header-library-design.md):
 * WhatsApp, the contact form, a booking link or a phone call. The setup form saves the merchant's answer in Store.onboarding;
 * every save keeps the resolved action in config.js as `primaryAction`, and the platform header and the page's calls to
 * action both use primaryActionLink, so they always agree. Anything unusable becomes the contact form.
 */
export const PRIMARY_ACTION_KINDS = ['whatsapp', 'form', 'booking', 'phone'] as const;
export type PrimaryActionKind = typeof PRIMARY_ACTION_KINDS[number];
export type PrimaryAction = { kind: PrimaryActionKind; value?: string };

/** Digits a wa.me or tel: link can dial. A Bolivian number typed without its country code (mobiles 6xxxxxxx and 7xxxxxxx,
 *  landlines 2xxxxxxx, 3xxxxxxx and 4xxxxxxx with their area code) gets 591; an international 00 is dropped. */
export function dialDigits(value: unknown): string | null {
  const digits = (typeof value === 'string' ? value.replace(/\D/g, '') : '').replace(/^00/, '');
  const full = digits.length === 8 && /^[2-467]/.test(digits) ? `591${digits}` : digits;
  return full.length >= 7 && full.length <= 15 ? full : null;
}

function bookingUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 300) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && url.hostname.includes('.') ? url.href : null;
  } catch { return null; }
}

/** The action a store uses: its saved choice made usable, or, with no choice at all, WhatsApp when it has a number. */
export function sourcePrimaryAction(saved: unknown, contactPhone?: string | null): PrimaryAction {
  if (saved === undefined || saved === null) {
    const digits = dialDigits(contactPhone);
    return digits ? { kind: 'whatsapp', value: digits } : { kind: 'form' };
  }
  const choice = typeof saved === 'object' ? saved as { kind?: unknown; value?: unknown } : {};
  if (choice.kind === 'whatsapp' || choice.kind === 'phone') {
    // WhatsApp follows the store number as it is now (Ajustes can change it after setup); a phone call keeps the number chosen for it.
    const digits = choice.kind === 'whatsapp' ? dialDigits(contactPhone) ?? dialDigits(choice.value) : dialDigits(choice.value) ?? dialDigits(contactPhone);
    return digits ? { kind: choice.kind, value: digits } : { kind: 'form' };
  }
  if (choice.kind === 'booking') {
    const url = bookingUrl(choice.value);
    return url ? { kind: 'booking', value: url } : { kind: 'form' };
  }
  return { kind: 'form' };
}

/** The action for this save: the merchant's setup choice, made usable against the store as it is now, before the action an
 *  earlier save kept in config.js (which is already resolved, so it cannot follow a later change of number). */
export function resolveStoreAction(setupChoice: unknown, keptAction: unknown, contactPhone?: string | null): PrimaryAction {
  return sourcePrimaryAction(setupChoice ?? keptAction, contactPhone);
}

/** The action as a link. `attributes` is trusted markup; `href` is escaped by whoever writes it into HTML. */
export function primaryActionLink(action: PrimaryAction): { href: string; label: string; attributes: string } {
  switch (action.kind) {
    case 'whatsapp': return { href: `https://wa.me/${action.value}`, label: 'Escríbenos', attributes: ' target="_blank" rel="noopener"' };
    case 'booking': return { href: action.value ?? 'contacto.html', label: 'Agenda una cita', attributes: ' target="_blank" rel="noopener"' };
    case 'phone': return { href: `tel:+${action.value}`, label: 'Llámanos', attributes: '' };
    default: return { href: 'contacto.html', label: 'Pide una cotización', attributes: ' data-pagosya-contact-open' };
  }
}

/** The action a saved store keeps in config.js (`window.PAGOSYA_CONFIG.primaryAction`); undefined when it has none. */
export function savedPrimaryAction(files: Array<{ path: string; content: string }>): unknown {
  const match = files.find(file => file.path === 'config.js')?.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
  if (!match) return undefined;
  try { return (JSON.parse(match[1]) as { primaryAction?: unknown }).primaryAction; } catch { return undefined; }
}

const CONTACT_SLOT = '<section data-pagosya-contact hidden></section>';
/** A showcase home needs the platform contact slot (the publish contract and the form action rely on it): added once, never fatal. */
export function withShowcaseContactSlot<F extends { path: string; content: string; encoding?: string }>(files: F[]): F[] {
  return files.map(file => {
    if (file.path !== 'index.html' || file.encoding === 'base64' || /data-pagosya-contact(?:\s|=|>)/.test(file.content)) return file;
    const at = file.content.lastIndexOf('</main>') >= 0 ? file.content.lastIndexOf('</main>') : file.content.lastIndexOf('</body>');
    return { ...file, content: at >= 0 ? `${file.content.slice(0, at)}${CONTACT_SLOT}${file.content.slice(at)}` : `${file.content}${CONTACT_SLOT}` };
  });
}
