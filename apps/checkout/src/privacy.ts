import '../../api/src/stores/source-kit/privacy.js';
type Privacy = { analyticsAllowed(slug: string): boolean; choice(slug: string): boolean | null; save(slug: string, analytics: boolean): void; mount(slug: string, options?: { analyticsAvailable?: boolean; preview?: boolean }): void };
export const privacy = (window as unknown as { PAGOSYA_PRIVACY: Privacy }).PAGOSYA_PRIVACY;
