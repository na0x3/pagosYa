import { storefrontPageProductIds } from "./storefront-page-products";
import type { StoreSiteDocument } from "./site-document";

const products = [
  { id: "bikini", name: "Bikini vichy rosa", tags: [], imageUrls: ["bikini.jpg"] },
  { id: "crochet", name: "Bikini crochet azul", tags: [], imageUrls: ["crochet.jpg"] },
  { id: "enterizo", name: "Enterizo floral marfil", tags: [], imageUrls: ["enterizo.jpg"] },
  { id: "vichy", name: "Enterizo vichy", tags: [], imageUrls: ["vichy.jpg"] },
];
describe("generated page product selection", () => {
  it("fills Enterizos with enterizos and Crochet with crochet products", () => {
    expect(storefrontPageProductIds({ id: "enterizos", slug: "enterizos", label: "Enterizos" }, [], products, 0)).toEqual(["enterizo", "vichy"]);
    expect(storefrontPageProductIds({ id: "crochet", slug: "crochet", label: "Crochet" }, [], products, 1)).toEqual(["crochet"]);
  });
  it("preserves a valid explicit selection and removes unknown or duplicate IDs", () => {
    expect(storefrontPageProductIds({ id: "crochet", slug: "crochet", label: "Crochet" }, [], products, 0, ["bikini", "foreign", "bikini"])).toEqual(["bikini"]);
  });
  it("uses products shown in the page photos when its title is editorial", () => {
    const sections = [{ pageId: "details", mediaUrls: ["enterizo.jpg"], items: [{ mediaUrl: "vichy.jpg" }] }] as StoreSiteDocument["sections"];
    expect(storefrontPageProductIds({ id: "details", slug: "detalles", label: "Una mirada cercana" }, sections, products, 0)).toEqual(["enterizo", "vichy"]);
  });
  it("supports a generic page with a small catalog and an empty store", () => {
    const page = { id: "story", slug: "historia", label: "Historia" };
    expect(storefrontPageProductIds(page, [], products.slice(0, 1), 1)).toEqual(["bikini"]);
    expect(storefrontPageProductIds(page, [], [], 0)).toEqual([]);
  });
});
