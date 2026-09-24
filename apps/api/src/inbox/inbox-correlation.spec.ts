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
  it("prevents hex-encoded markup from escaping (lowercase x)", () => {
    // Hex entity encoding: &#x3C; and &#x3E; must not decode to executable markup
    const hexResult = htmlToText("&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;");
    expect(hexResult).not.toContain("<");
    expect(hexResult).not.toContain(">");
  });
  it("prevents hex-encoded markup from escaping (uppercase X)", () => {
    // Hex entity encoding with uppercase X: &#X3C; and &#X3E;
    const hexUpperResult = htmlToText("&#X3C;script&#X3E;alert(1)&#X3C;/script&#X3E;");
    expect(hexUpperResult).not.toContain("<");
    expect(hexUpperResult).not.toContain(">");
  });
  it("handles malformed code points without throwing", () => {
    // Invalid code point (above 0x10FFFF) must not throw
    expect(() => htmlToText("&#999999999;")).not.toThrow();
    const result = htmlToText("&#999999999;");
    expect(result).toBeDefined();
  });
  it("prevents hex entity chaining attacks", () => {
    // Hex entity decoding output cannot chain with adjacent text to form new entities
    // &#x26; (hex ampersand) followed by #60; must not form &#60; (which decodes to <)
    const chainResult = htmlToText("&#x26;#60;b onclick=alert(1)");
    expect(chainResult).not.toContain("<");
    expect(chainResult).not.toContain(">");
  });
  it("prevents named entity chaining attacks", () => {
    // Named entity decoding output cannot chain with adjacent text to form new entities
    // &amp; (ampersand) followed by #60; must not form &#60; (which decodes to <)
    const chainResult = htmlToText("&amp;#60;b onclick=alert(1)");
    expect(chainResult).not.toContain("<");
    expect(chainResult).not.toContain(">");
  });
});

describe("htmlToText — code points Postgres cannot store", () => {
  it("strips a NUL entity instead of producing \\u0000, which Postgres text rejects (22021)", () => {
    // String.fromCodePoint(0) does not throw, so the old try/catch never saw
    // this. The INSERT did: one "&#0;" in a mail turned into a 500 and a Svix
    // retry storm on the same payload.
    const out = htmlToText("hola&#0;mundo");
    expect(out).not.toContain("\u0000");
    expect(out).toBe("holamundo");
  });

  it("strips the hex spelling of NUL too", () => {
    expect(htmlToText("a&#x0;b")).toBe("ab");
  });

  it("strips the C0 controls below tab", () => {
    const out = htmlToText("a&#1;&#8;b");
    expect(out).toBe("ab");
    expect(/[\u0000-\u0008]/.test(out)).toBe(false);
  });

  it("strips a lone surrogate, which is invalid UTF-16", () => {
    const out = htmlToText("a&#xD800;b");
    expect(out).toBe("ab");
    expect(/[\uD800-\uDFFF]/.test(out)).toBe(false);
  });

  it("keeps tab, newline and every ordinary character", () => {
    expect(htmlToText("Caf&eacute;&#9;y t&#233;")).toBe("Café\ty té");
  });

  it("still preserves the original text for a code point outside Unicode", () => {
    expect(htmlToText("x&#99999999;y")).toBe("x&#99999999;y");
  });
});
