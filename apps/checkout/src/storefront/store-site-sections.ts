import { type StoreSiteDocument } from "../site-document";

/** Finds the authored site section of a kind on the current page. */
export type StoreSiteSectionLookup = (kind: StoreSiteDocument["sections"][number]["kind"]) => StoreSiteDocument["sections"][number] | undefined;
