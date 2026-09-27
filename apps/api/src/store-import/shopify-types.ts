/** A Shopify store as read from its public endpoints or its product CSV (spec 2026-09-27 §2). Neutral: no pagosYa types. */
export type ShopifyVariant = { id: string; options: string[]; sku: string | null; price: string; compareAtPrice: string | null; available: boolean; grams: number; inventoryQuantity?: number; imageSrc?: string };
export type ShopifyProduct = { handle: string; title: string; bodyHtml: string; productType: string; tags: string[]; optionNames: string[]; variants: ShopifyVariant[]; images: string[] };
export type ShopifyCollection = { handle: string; title: string; description: string; productHandles: string[] };
export type ShopifyArticle = { kind: 'page' | 'policy'; handle: string; title: string; bodyHtml: string };
export type ShopifyStoreData = { host: string; origin: string; name: string; currency: string; products: ShopifyProduct[]; collections: ShopifyCollection[]; articles: ShopifyArticle[]; truncated: boolean; stockKnown: boolean; warnings: string[] };
