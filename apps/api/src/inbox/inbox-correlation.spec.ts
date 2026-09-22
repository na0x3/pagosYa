import { parseReferences, htmlToText } from "./inbox-correlation";

describe("parseReferences", () => {
  it("reads every Message-ID out of a References chain", () => {
    expect(parseReferences("<a@mail.test> <b@mail.test>")).toEqual(["a@mail.test", "b@mail.test"]);
  });
  it("tolerates a missing header", () => {
    expect(parseReferences(null)).toEqual([]);
    expect(parseReferences("   ")).toEqual([]);
  });
  it("ignores text that is not a bracketed id", () => {
    expect(parseReferences("charla suelta <real@mail.test>")).toEqual(["real@mail.test"]);
  });
});

describe("htmlToText", () => {
  it("drops tags and keeps the readable text", () => {
    expect(htmlToText("<p>Hola <b>Ana</b></p>")).toBe("Hola Ana");
  });
  it("removes script and style contents entirely", () => {
    expect(htmlToText("<script>alert(1)</script><p>Hola</p>")).toBe("Hola");
    expect(htmlToText("<style>p{color:red}</style><p>Hola</p>")).toBe("Hola");
  });
  it("turns block breaks into newlines", () => {
    expect(htmlToText("<p>Una</p><p>Dos</p>")).toBe("Una\nDos");
  });
  it("decodes the common entities", () => {
    expect(htmlToText("<p>Caf&eacute; &amp; t&eacute;</p>")).toBe("Café & té");
  });
  it("prevents entity-encoded markup from escaping", () => {
    // Named entity encoding: &lt; and &gt; must not decode to executable markup
    const namedResult = htmlToText("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(namedResult).not.toContain("<");
    expect(namedResult).not.toContain(">");
    // Numeric entity encoding: &#60; (lt) and &#62; (gt) must not decode to executable markup
    const numericResult = htmlToText("&#60;script&#62;alert(1)&#60;/script&#62;");
    expect(numericResult).not.toContain("<");
    expect(numericResult).not.toContain(">");
  });
  it("preserves double-encoded entities as inert text", () => {
    // Double-encoded: &amp;lt; should become &lt; (literal text, not markup)
    expect(htmlToText("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
  });
});
