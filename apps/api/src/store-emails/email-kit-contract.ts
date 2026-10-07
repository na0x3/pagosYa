/**
 * The contract between the AI that designs a store's email kit and the platform that
 * assembles every email from it. The author writes slots and never a fact; the platform
 * fills them. Spec: docs/superpowers/specs/2026-10-07-store-email-look-design.md
 */
export const EMAIL_BLOCK_TYPES = ['hero', 'heading', 'items', 'button', 'products', 'promo', 'note', 'announce', 'address', 'steps', 'trust', 'quote', 'story', 'contact'] as const;
export type EmailBlockType = typeof EMAIL_BLOCK_TYPES[number];
/** Without these a kit cannot become a store's look; a missing one still falls back per block when rendering. */
export const REQUIRED_EMAIL_BLOCKS: readonly EmailBlockType[] = ['heading', 'items', 'button', 'note'];

export const EMAIL_TYPES = ['order_confirmation', 'appointment_confirmed'] as const;
export type EmailType = typeof EMAIL_TYPES[number];
/** Stage 1 sends no marketing email; the unsubscribe rule is implemented and tested for stage 2. */
export const MARKETING_EMAIL_TYPES: ReadonlySet<string> = new Set<string>([]);

export const EMAIL_COPY_FIELDS = { subject: 90, preheader: 110, headline: 80, intro: 400, cta: 30, signoff: 160, announcement: 90, storyTitle: 60, storyText: 300, note: 200, recommendTitle: 60, helpTitle: 60 } as const;
export type EmailCopyField = keyof typeof EMAIL_COPY_FIELDS;
export type EmailCopy = Partial<Record<EmailType, Partial<Record<EmailCopyField, string>>>>;

export const EMAIL_KIT_FILE_MAX_BYTES = 80 * 1024;
export const EMAIL_RENDER_MAX_BYTES = 90 * 1024;

/** Slots the platform fills as an attribute rather than as text. */
export const ATTRIBUTE_SLOTS: Record<string, 'src' | 'href'> = {
  'data-store-logo': 'src', 'data-store-link': 'href', 'data-email-unsubscribe': 'href',
  'data-block-image': 'src', 'data-block-link': 'href', 'data-item-image': 'src', 'data-product-image': 'src', 'data-product-link': 'href',
  'data-step-icon': 'src', 'data-trust-icon': 'src', 'data-contact-icon': 'src', 'data-contact-value': 'href',
  'data-nav-link': 'href', 'data-social': 'href', 'data-social-icon': 'src', 'data-policy-link': 'href',
};

/** Blocks built around one repeated row; the author writes exactly one and the platform clones it per entry. */
export const BLOCK_ROWS: Partial<Record<EmailBlockType, string>> = {
  items: 'data-item', products: 'data-product', address: 'data-line', steps: 'data-step', trust: 'data-trust', contact: 'data-contact',
};
export type BlockTone = 'light' | 'dark';

export type RawEmailKit = { layout: string; blocks: string; copy: unknown };
export type ValidEmailKit = { layout: string | null; blocks: Partial<Record<EmailBlockType, string>>; copy: EmailCopy };
