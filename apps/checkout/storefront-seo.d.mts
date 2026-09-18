export function applySeoDocument(html: string, document: { head: string; body: string }, noindex?: boolean): string;
export function createStorefrontSeo(options: { apiBase: string; checkoutOrigin: string; template: (url: string) => Promise<string> }): (request: any, response: any, next: () => void) => Promise<void>;
