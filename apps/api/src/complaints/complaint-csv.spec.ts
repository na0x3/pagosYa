import { toCsv } from "./complaint-csv";

describe("toCsv", () => {
  it("quotes and escapes cells", () => {
    expect(toCsv([{ a: 'dijo "hola", y se fue', b: 3 }], ["a", "b"])).toBe('a,b\r\n"dijo ""hola"", y se fue",3\r\n');
  });
  it("defuses spreadsheet formulas", () => {
    expect(toCsv([{ a: "=HYPERLINK(\"x\")" }, { a: "+1" }, { a: "-2" }, { a: "@SUM(A1)" }], ["a"])).toBe(
      "a\r\n\"'=HYPERLINK(\"\"x\"\")\"\r\n'+1\r\n'-2\r\n'@SUM(A1)\r\n",
    );
  });
  it("writes null as empty", () => {
    expect(toCsv([{ a: null }], ["a"])).toBe("a\r\n\r\n");
  });
  it("uses the delimiter it is given and quotes cells that contain it", () => {
    expect(toCsv([{ a: "Tienda; Uno", b: 3 }], ["a", "b"], ";")).toBe('a;b\r\n"Tienda; Uno";3\r\n');
  });
});
