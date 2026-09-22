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
});
