import { appendComplaintsFooter, complaintsTextLine, complaintsUrl } from "./complaint-links";

describe("complaint links in receipts", () => {
  const url = complaintsUrl("https://checkout.pagosya.bo/", "pi_abc123");
  it("prefills the payment reference", () => {
    expect(url).toBe("https://checkout.pagosya.bo/reclamos?ref=pi_abc123");
  });
  it("adds one plain-text line", () => {
    expect(complaintsTextLine(url)).toBe("\n¿Problemas con tu compra? Presenta un reclamo: https://checkout.pagosya.bo/reclamos?ref=pi_abc123\n");
  });
  it("puts the footer before </body>, or at the end when there is none", () => {
    expect(appendComplaintsFooter("<html><body><p>Hola</p></body></html>", url)).toMatch(/<p>Hola<\/p><p [^>]*>¿Problemas con tu compra\? <a href="https:\/\/checkout\.pagosya\.bo\/reclamos\?ref=pi_abc123"[^>]*>Presenta un reclamo<\/a><\/p><\/body><\/html>$/);
    expect(appendComplaintsFooter("<p>Hola</p>", url)).toMatch(/^<p>Hola<\/p><p /);
  });
});
